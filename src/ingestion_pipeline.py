import os
import json
import csv
import re
from pathlib import Path
import pandas as pd
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
from bedrock_helper import BedrockInstructorHelper, BedrockEmbeddingHelper
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import random
from threading import Lock


warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

# ---------------- CONFIG ----------------
MAX_CHUNK_SIZE = 6500

# Directories
PROJECT_ROOT = Path(__file__).parent.parent
FILINGS_DIR = PROJECT_ROOT / "data" / "fillings"
DIRECTIVES_DIR = PROJECT_ROOT / "data" / "directives"

STAGED_OUTPUT_DIR = PROJECT_ROOT / "src" / "data" / "staged_chunks"
STAGED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

EXTRACTED_OUTPUT_DIR = PROJECT_ROOT / "src" / "data" / "structured_data"
EXTRACTED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
# MAX_WORKERS = int((2 * (os.cpu_count())) /3)
MAX_WORKERS = 5
# ---------------- UTILITIES ----------------
def read_file(file_path: Path) -> str:
    """Read file robustly."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="latin-1") as f:
            return f.read()
    except Exception as e:
        print(f"Error reading {file_path.name}: {e}")
        return ""

def clean_document_text(raw_text: str) -> str:
    """Clean HTML or XML documents efficiently."""
    text = ""
    raw_text = raw_text.lstrip()
    if raw_text.startswith('<?xml') or raw_text.startswith('<!DOCTYPE'):
        # XML parsing
        soup = BeautifulSoup(raw_text, "lxml-xml")
        text = soup.get_text(separator=' ', strip=True)
    else:
        # HTML parsing
        soup = BeautifulSoup(raw_text, "lxml")
        for element in soup(["script", "style"]):
            element.decompose()
        for comment in soup.find_all(string=lambda t: isinstance(t, type(soup.Comment))):
            comment.extract()
        text = soup.get_text(separator=' ', strip=True)
    text = re.sub(r'\s+', ' ', text)
    return text

def chunk_text(text: str, max_size: int = MAX_CHUNK_SIZE):
    """Split text into chunks for LLM ingestion."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks, current = [], ""
    for s in sentences:
        if len(current) + len(s) + 1 <= max_size:
            current += " " + s if current else s
        else:
            if current: chunks.append(current)
            if len(s) > max_size:
                for i in range(0, len(s), max_size):
                    chunks.append(s[i:i+max_size])
                current = ""
            else:
                current = s
    if current: chunks.append(current)
    return chunks

def append_to_csv(file_path: Path, rows: list[dict], output_csv: Path):
    """Append rows to CSV immediately (streaming-safe)."""
    file_exists = output_csv.exists()
    with open(output_csv, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["file_name", "chunk_index", "chunk_text", "embedding"])
        if not file_exists:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def get_completed_files(output_csv: Path) -> set[str]:
    """Return a set of file names already processed (for resume)."""
    if not output_csv.exists():
        return set()
    df = pd.read_csv(output_csv, usecols=["file_name"])
    return set(df["file_name"].unique())
# ---------------- STAGING ----------------
def stage_documents(doc_dir: Path, embed_helper: BedrockEmbeddingHelper, output_csv: Path):

    completed = get_completed_files(output_csv)
    # support for nested subdirectories
    all_files = (doc_dir.rglob("*"))
    for file_path in all_files:
        if file_path.suffix.lower() not in ('.html', '.htm', '.xml', '.txt'):
            continue

        text = read_file(file_path)
        if not text:
            continue

        clean_text = clean_document_text(text)
        chunks = chunk_text(clean_text)

        staged_rows = []
        # Parallel embedding
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:  # adjust workers as needed
            future_to_index = {executor.submit(embed_helper.embed_text, chunk): i for i, chunk in enumerate(chunks)}
            for future in as_completed(future_to_index):
                i = future_to_index[future]
                try:
                    embedding = future.result()
                    staged_rows.append({
                        "file_name": file_path.name,
                        "chunk_index": i,
                        "chunk_text": chunks[i],
                        "embedding": embedding
                    })
                except Exception as e:
                    print(f"Error embedding chunk {i} of {file_path.name}: {e}")

        print(f"Staged {len(chunks)} chunks for {file_path.name}")

        # save to final csv
        if staged_rows:
            append_to_csv(file_path, staged_rows, output_csv)
            print(f"✔ Saved {len(staged_rows)} chunks for {file_path.name}")
        del text, clean_text, chunks, staged_rows

# ---------------- EXTRACTION ----------------
# Lock for thread-safe CSV writing
write_lock = Lock()
def process_file(file_name, group, bedrock_helper, doc_type):
    combined_text = " ".join(group["chunk_text"].tolist())
    print(f"Processing {file_name} ({len(group)} chunks, {len(combined_text)} characters)")

    try:
        summary_text = bedrock_helper.summarize_text(combined_text)
    except Exception as e:
        print(f"Error summarizing {file_name}: {e}")
        return None

    structured_rows = []

    try:
        if doc_type == "filing":
            company_info = bedrock_helper.extract_10k_info(summary_text)
            financials = bedrock_helper.analyze_financials(summary_text)
            risks = bedrock_helper.assess_risk(summary_text, company_symbol=company_info.get("trading_symbol", ""))
            strategy = bedrock_helper.analyze_strategy(summary_text, sector=company_info.get("primary_sector", ""))

            structured_rows.append({
                "file_name": file_name,
                **company_info,
                **financials,
                **risks,
                **strategy
            })

        elif doc_type == "regulation":
            analysis = bedrock_helper.analyze_regulation(summary_text)
            structured_rows.append({
                "file_name": file_name,
                **analysis
            })

    except Exception as e:
        print(f"Error extracting structured data from {file_name}: {e}")
        return None

    return structured_rows

def extract_structured_data(
        staged_csv: Path,
        bedrock_helper,
        output_csv: Path,
        doc_type: str = "filing",
        max_workers: int = 2
):
    df = pd.read_csv(staged_csv)

    if "chunk_index" in df.columns:
        df = df.sort_values(["file_name", "chunk_index"])
    else:
        df = df.sort_values("file_name")

    try:
        processed_df = pd.read_csv(output_csv)
        processed_files = set(processed_df["file_name"].unique())
    except FileNotFoundError:
        processed_files = set()

    first_write = not output_csv.exists()

    futures = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for file_name, group in df.groupby("file_name"):
            if file_name in processed_files:
                print(f"Skipping already processed file: {file_name}")
                continue
            futures.append(executor.submit(process_file, file_name, group, bedrock_helper, doc_type))

        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                with write_lock:
                    pd.DataFrame(result).to_csv(output_csv, mode="a", index=False, header=first_write)
                    first_write = False
                    print(f"Saved structured data -> {output_csv}")

# ---------------- MAIN ----------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["stage", "extract"], required=True, help="Stage or extract")
    parser.add_argument("--doc_type", choices=["filing", "regulation"], default="filing", help="Document type")
    args = parser.parse_args()

    helper = BedrockInstructorHelper()
    embed_helper = BedrockEmbeddingHelper()

    if args.mode == "stage":
        if args.doc_type == "filing":
            stage_documents(FILINGS_DIR, embed_helper, STAGED_OUTPUT_DIR / "filings_staged.csv")
        else:
            stage_documents(DIRECTIVES_DIR, embed_helper, STAGED_OUTPUT_DIR / "regulations_staged.csv")

    elif args.mode == "extract":
        if args.doc_type == "filing":
            extract_structured_data(STAGED_OUTPUT_DIR / "filings_staged.csv", helper,
                                    EXTRACTED_OUTPUT_DIR / "filings_structured.csv", doc_type="filing")
        else:
            extract_structured_data(STAGED_OUTPUT_DIR / "regulations_staged.csv", helper,
                                    EXTRACTED_OUTPUT_DIR / "regulations_structured.csv", doc_type="regulation")
