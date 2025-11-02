import os
import json
import re
from pathlib import Path
from typing import Dict, List
from bs4 import BeautifulSoup
from src.bedrock_helper import (
    BedrockInstructorHelper, BedrockEmbeddingHelper, Company10K, FinancialMetrics, RiskAnalysis, StrategicLandscape, RegulatoryAnalysis
)
from datetime import datetime

# --- Configuration ---
current_file_dir = Path(__file__).parent
project_root = current_file_dir.parent.parent

# Maximum chunk size to send to the LLM
MAX_CHUNK_SIZE = 8192
# data loading dirs
FILINGS_DIRECTORY = project_root / "Datathon" / "data" / "fillings" / "A"
DIRECTIVES_DIRECTORY = project_root / "Datathon" / "data" / "directives"
# data saving dirs
DIRECTIVES_EMBEDDING_DIRECTORY = project_root / "src" / "data" /"directives_embeddings"
FILINGS_DATA_DIRECTORY = project_root / "src" / "data" / "filings_data"
FILINGS_DATA_EMBEDDING_DIRECTORY = project_root / "src" / "data" / "filings_embedding"
# creating dirs they do not exist
if not os.path.exists(FILINGS_DATA_DIRECTORY):
    os.makedirs(FILINGS_DATA_DIRECTORY)
if not os.path.exists(FILINGS_DATA_EMBEDDING_DIRECTORY):
    os.makedirs(FILINGS_DATA_EMBEDDING_DIRECTORY)
if not os.path.exists(DIRECTIVES_EMBEDDING_DIRECTORY):
    os.makedirs(DIRECTIVES_EMBEDDING_DIRECTORY)

# --- Utilities ---
def read_document_content(file_path: Path) -> str:
    """Read a document robustly."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='latin-1') as f:
            return f.read()
    except Exception as e:
        print(f"Error reading {file_path.name}: {e}")
        return ""

def chunk_text(text: str, max_size: int = MAX_CHUNK_SIZE) -> List[str]:
    # Split text into sentences using punctuation (simple approach)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 <= max_size:
            current_chunk += " " + sentence if current_chunk else sentence
        else:
            if current_chunk:
                chunks.append(current_chunk)
            # If single sentence is bigger than max_size, split it forcibly
            if len(sentence) > max_size:
                for i in range(0, len(sentence), max_size):
                    chunks.append(sentence[i:i+max_size])
                current_chunk = ""
            else:
                current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return chunks

# --- HTML/Text Extraction Utility (Unchanged for 10-K logic, parser updated) ---

def extract_10k_sections(html_content: str) -> Dict[str, str]:
    """
    Parses the 10-K HTML content to extract specific, high-value sections
    by targeting common SEC filing Item headers. This reduces input size for the LLM.
    """
    print("  [Parser] Starting HTML parsing with BeautifulSoup...")
    # Using 'xml' parser for robust handling of potentially messy HTML or XML filings
    soup = BeautifulSoup(html_content, 'xml')
    sections = {
        "cover": "",  # For administrative data (usually early text)
        "business": "",  # Item 1 (General Business Description)
        "risk_factors": "",  # Item 1A (Risk Factors)
        "mda_financials": ""  # Item 7 (Management's Discussion & Analysis)
    }

    # Common headers to look for (Case-insensitive approach is often required for messy HTML)
    item_identifiers = {
        "Item 1A.": "risk_factors",
        "Item 7.": "mda_financials",
        "Item 1.": "business",
    }

    current_section = "cover"  # Start by capturing cover data

    # Iterate through all elements to capture content between item headers
    for element in soup.find_all(True):
        text = element.get_text(strip=True)
        if not text:
            continue

        # Check if the text matches any known Item header
        # Using a partial match and checking length to avoid false positives
        for identifier, section_key in item_identifiers.items():
            if identifier in text and len(text) < 100:  # Check if it's likely a header
                if section_key == "business" and current_section != "cover":
                    # Avoid re-starting Item 1 if we're already past it
                    continue
                current_section = section_key
                # Stop looking for Item 1A/7 if we hit Item 8 (Financial Statements)
                if identifier == "Item 8.":
                    current_section = None
                    break
                break

        if current_section:
            # Aggregate text for the current active section
            sections[current_section] += " " + text

    # Clean and truncate sections
    for key in sections:
        sections[key] = ' '.join(sections[key].split())
        # Truncate to ensure prompt fits within token limits
        sections[key] = sections[key][:MAX_CHUNK_SIZE]
        if sections[key]:
            print(f"  [Parser] Extracted {len(sections[key]):,} characters for {key}.")

    return sections

# --- Main LLM Processing Chains ---
def process_filing_pipeline(file_content: str, file_name: str, helper: BedrockInstructorHelper, embed_helper: BedrockEmbeddingHelper):
    """Structured + embedding extraction for 10-K filings."""
    if not file_content:
        return

    print(f"\n--- [START 10-K PROCESSING] {file_name} ---")
    sections = extract_10k_sections(file_content)
    structured_data = {}
    # Structured extraction
    try:
        company_info: Company10K = helper.extract_10k_info(sections["cover"])
        metrics: FinancialMetrics = helper.analyze_financials(sections["mda_financials"])
        risk: RiskAnalysis = helper.assess_risk(sections["risk_factors"], company_info.trading_symbol)
        strategy: StrategicLandscape = helper.analyze_strategy(sections["business"] + " " + sections["mda_financials"], company_info.primary_sector)
        print(f"{company_info.company_name} ({company_info.trading_symbol}) processed.")
        # save data
        structured_data = {
            "company_name": company_info.company_name,
            "trading_symbol": company_info.trading_symbol,
            "sector": company_info.primary_sector,
            "filing_date": getattr(company_info, "filing_date", None),
            "financial_metrics": metrics.__dict__,
            "risk_analysis": risk.__dict__,
            "strategy": strategy.__dict__,
        }
        # Save structured data
        structured_file = FILINGS_DATA_DIRECTORY / f"{file_name}_structured.json"
        with open(structured_file, "w", encoding="utf-8") as f:
            json.dump(structured_data, f, indent=2, ensure_ascii=False)
        print(f"Structured data saved to {structured_file.name}")

    except Exception as e:
        print(f"Structured extraction failed: {e}")

    # Embedding extraction
    try:
        all_text = " ".join(sections.values())
        for i, chunk in enumerate(chunk_text(all_text)):
            embedding = embed_helper.embed_text(chunk)
            embedding_path = FILINGS_DATA_EMBEDDING_DIRECTORY / f"{file_name}_{i+1}.txt"
            with open(embedding_path, "w", encoding="utf-8") as f:
                json.dump({"chunk_index": i + 1, "embedding": embedding}, f)
            # Store embedding somewhere: DB / FAISS / JSON file
            print(f"  Embedding chunk {i+1}: {len(embedding)} dims")
    except Exception as e:
        print(f"Embedding generation failed: {e}")

    print(f"--- [END 10-K PROCESSING] {file_name} ---")

def save_embeddings_json(file_name: str, embeddings: List[List[float]], output_dir: Path = DIRECTIVES_EMBEDDING_DIRECTORY):
    """Save embeddings to a JSON file with metadata for later reuse."""
    output_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "file_name": file_name,
        "timestamp": datetime.utcnow().isoformat(),
        "embedding_count": len(embeddings),
        "embeddings": embeddings
    }

    output_path = output_dir / f"{file_name}.embeddings.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"Saved {len(embeddings)} embeddings → {output_path}")

def process_regulation_pipeline(file_content: str, file_name: str, helper: BedrockInstructorHelper, embed_helper: BedrockEmbeddingHelper):
    """
    Executes the LLM chain for structured analysis of legislative documents.
    """
    if not file_content: return

    print(f"\n--- [START REGULATION PROCESSING] {file_name} ---")

    # 1. Clean the text for LLM ingestion
    soup = BeautifulSoup(file_content, 'xml')
    clean_text = soup.get_text(separator=' ', strip=True)
    clean_text = ' '.join(clean_text.split())

    # Truncate the clean text
    document_text_chunk = clean_text[:MAX_CHUNK_SIZE]
    print(f"[Parser] Cleaned and truncated document to {len(document_text_chunk):,} characters.")

    # Structured extraction
    try:
        for chunk in chunk_text(clean_text):
            analysis: RegulatoryAnalysis = helper.analyze_regulation(chunk)
            print(f"{analysis.law_name} ({analysis.country_region})")
    except Exception as e:
        print(f"Structured regulatory analysis failed: {e}")

    # Embedding extraction
    try:
        embeddings = []
        for i, chunk in enumerate(chunk_text(clean_text)):
            embedding = embed_helper.embed_text(chunk)
            embeddings.append(embedding)
            print(f"Embedding chunk {i + 1}: {len(embedding)} dims")
        save_embeddings_json(file_name, embeddings)
    except Exception as e:
        print(f"Embedding generation failed: {e}")

    print(f"--- [END REGULATION PROCESSING] {file_name} ---")



# --- Entry Point ---
if __name__ == "__main__":
    helper = BedrockInstructorHelper()
    embed_helper = BedrockEmbeddingHelper()

    # Process 10-K Filings
    print("Starting filing dir")
    if FILINGS_DIRECTORY.is_dir():
        for file_path in FILINGS_DIRECTORY.iterdir():
            if file_path.suffix.lower() in ('.html', '.htm', '.xml', '.txt'):
                content = read_document_content(file_path)
                process_filing_pipeline(content, file_path.name, helper, embed_helper)
    print("Completed filing dir")

    print("Starting directives dir")
    # Process Regulatory Directives
    if DIRECTIVES_DIRECTORY.is_dir():
        for file_path in DIRECTIVES_DIRECTORY.iterdir():
            if file_path.suffix.lower() in ('.html', '.htm', '.xml', '.txt'):
                content = read_document_content(file_path)
                process_regulation_pipeline(content, file_path.name, helper, embed_helper)
    print("Completed directives dir")

    print("\nProcessing complete.")

