import pandas as pd
import os
import numpy as np

# Get the directory where this script is located
current_file_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_file_dir))
data_dir = os.path.join(project_root, "data")

SP_COMPOSITION = os.path.join(data_dir, "2025-08-15_composition_sp500.csv")
SP_PERF = os.path.join(data_dir, "2025-09-26_stocks-performance.csv")

# Output should be in the same directory as this script
OUT = os.path.join(current_file_dir, "sp500_master.csv")


def parse_composition_number(s):
    """Simple parser for composition CSV numbers that use commas as decimals."""
    if pd.isna(s):
        return np.nan

    s = str(s).strip().replace(' ', '').replace('"', '').replace("'", "")

    if not s:
        return np.nan

    # Replace comma with dot and convert
    s = s.replace(',', '.')

    try:
        return float(s)
    except ValueError:
        return np.nan


def load_composition(path=SP_COMPOSITION):
    """Load composition data - commas are decimals in this file."""
    df = pd.read_csv(path, sep=None, engine="python", encoding="utf-8")

    # Clean column names
    df.columns = [c.strip().replace('#', 'num').strip() for c in df.columns]

    # Map columns
    col_map = {}
    for c in df.columns:
        lc = c.lower()
        if "symbol" in lc or "ticker" in lc:
            col_map[c] = "symbol"
        elif "company" in lc:
            col_map[c] = "company"
        elif "weight" in lc:
            col_map[c] = "weight"
        elif "price" in lc:
            col_map[c] = "price"
        elif lc in ["num", "no", "#", "number", "rank"]:
            col_map[c] = "rank"

    df = df.rename(columns=col_map)

    # Process numeric columns - simple comma replacement
    if "weight" in df.columns:
        df["weight"] = df["weight"].apply(parse_composition_number)
    if "price" in df.columns:
        df["price"] = df["price"].apply(parse_composition_number)
    if "rank" in df.columns:
        df["rank"] = pd.to_numeric(df["rank"], errors='coerce')

    # Clean symbol column
    if "symbol" in df.columns:
        df["symbol"] = df["symbol"].astype(str).str.upper().str.strip()

    return df


def load_performance(path=SP_PERF):
    """Load performance data - standard US number format."""
    # Use pandas built-in parser for standard numeric formats
    df = pd.read_csv(path, sep=None, engine="python", encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]

    col_map = {}
    for c in df.columns:
        lc = c.lower()
        if lc in ("symbol", "ticker"):
            col_map[c] = "symbol"
        elif "company" in lc:
            col_map[c] = "company"
        elif "market cap" in lc or "market_cap" in lc:
            col_map[c] = "market_cap"
        elif "revenue" in lc:
            col_map[c] = "revenue"
        elif "net income" in lc or "net_income" in lc:
            col_map[c] = "net_income"
        elif "eps" in lc:
            col_map[c] = "eps"
        elif "fcf" in lc or "free" in lc:
            col_map[c] = "fcf"
        elif "op" in lc and "income" in lc:
            col_map[c] = "op_income"

    df = df.rename(columns=col_map)

    # Clean symbol column
    if "symbol" in df.columns:
        df["symbol"] = df["symbol"].astype(str).str.upper().str.strip()

    # Convert numeric columns using pandas (handles standard formats)
    numeric_cols = ["market_cap", "revenue", "op_income", "net_income", "eps", "fcf"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def build_master(out=OUT):
    """Build master dataset by merging composition and performance data."""
    comp = load_composition()
    perf = load_performance()

    print(f"Composition data: {len(comp)} rows")
    print(f"Performance data: {len(perf)} rows")

    # Merge on symbol
    master = comp.merge(perf, on="symbol", how="left", suffixes=("", "_perf"))

    # Clean up duplicate company column
    if "company_perf" in master.columns:
        master = master.drop(columns=["company_perf"])

    # Save results
    master.to_csv(out, index=False)
    print(f"Master data: {len(master)} rows")
    print(f"Output written to: {out}")

    # Show sample
    print("\nSample of processed data:")
    sample_cols = ["symbol", "company", "weight", "price", "market_cap"]
    available_cols = [col for col in sample_cols if col in master.columns]
    if available_cols:
        print(master[available_cols].head())

    return master


if __name__ == "__main__":
    build_master()