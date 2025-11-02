import os
import json
import re
from pathlib import Path
import pandas as pd
from bs4 import BeautifulSoup
from bedrock_helper import BedrockInstructorHelper, BedrockEmbeddingHelper
import warnings
from bs4 import XMLParsedAsHTMLWarning
from concurrent.futures import ThreadPoolExecutor, as_completed

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

# ---------------- CONFIG ----------------
MAX_CHUNK_SIZE = 8192

# Directories
PROJECT_ROOT = Path(__file__).parent.parent

# todo: make sure to that in fillings dir make sure all the html are checked even inside the subdirs
# todo: make all different file for each html or xml in stage phase for extract phase can keep all in 1 file
FILINGS_DIR = PROJECT_ROOT / "data" / "fillings"
DIRECTIVES_DIR = PROJECT_ROOT / "data" / "directives"

STAGED_OUTPUT_DIR = PROJECT_ROOT / "src" / "data" / "staged_chunks"
STAGED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

EXTRACTED_OUTPUT_DIR = PROJECT_ROOT / "src" / "data" / "structured_data"
EXTRACTED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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

def clean_html_text(raw_text: str) -> str:
    """Robust HTML cleaning for filings and directives."""
    soup = BeautifulSoup(raw_text, "lxml")  # HTML parser for filings

    # Remove scripts, styles, comments
    for element in soup(["script", "style"]):
        element.decompose()
    for comment in soup.find_all(string=lambda text: isinstance(text, type(soup.Comment))):
        comment.extract()

    text = soup.get_text(separator=' ', strip=True)
    text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
    return text

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

# ---------------- STAGING ----------------
def stage_documents(doc_dir: Path, embed_helper: BedrockEmbeddingHelper, output_csv: Path):
    staged_rows = []

    for file_path in doc_dir.iterdir():
        if file_path.suffix.lower() not in ('.html', '.htm', '.xml', '.txt'):
            continue

        text = read_file(file_path)
        if not text:
            continue

        clean_text = clean_document_text(text)
        chunks = chunk_text(clean_text)

        # Use ThreadPoolExecutor for embedding multiple chunks in parallel
        with ThreadPoolExecutor(max_workers=4) as executor:  # adjust workers as needed
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

    df = pd.DataFrame(staged_rows)
    df.to_csv(output_csv, index=False)
    print(f"Saved staged chunks -> {output_csv}")

# ---------------- EXTRACTION ----------------
def extract_structured_data(staged_csv: Path, bedrock_helper: BedrockInstructorHelper, output_csv: Path, doc_type: str = "filing"):
    """Aggregate staged chunks and run structured extraction."""
    df = pd.read_csv(staged_csv)
    structured_rows = []

    for file_name, group in df.groupby("file_name"):
        combined_text = " ".join(group["chunk_text"].tolist())
        print(f"Processing {file_name} ({len(group)} chunks)")

        try:
            if doc_type == "filing":
                company_info = bedrock_helper.extract_10k_info(combined_text)
                financials = bedrock_helper.analyze_financials(combined_text)
                risks = bedrock_helper.assess_risk(combined_text, company_symbol=company_info.get("trading_symbol", ""))
                strategy = bedrock_helper.analyze_strategy(combined_text, sector=company_info.get("primary_sector", ""))

                structured_rows.append({
                    "file_name": file_name,
                    **company_info,
                    **financials,
                    **risks,
                    **strategy
                })

            elif doc_type == "regulation":
                print("Processing regulation")
                analysis = bedrock_helper.analyze_regulation(combined_text)
                structured_rows.append({
                    "file_name": file_name,
                    **analysis
                })

        except Exception as e:
            print(f"Error processing {file_name}: {e}")

    pd.DataFrame(structured_rows).to_csv(output_csv, index=False)
    print(f"Extracted structured data -> {output_csv}")

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
