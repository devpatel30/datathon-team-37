import boto3
import instructor
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from textwrap import wrap
import json

# Initialized instructor with Bedrock
bedrock_client = boto3.client('bedrock-runtime', region_name='us-west-2')
client = instructor.from_bedrock(bedrock_client)


# Defining models for structured extraction

class Company10K(BaseModel):
    company_name: str = Field(..., description="Full legal name of the company")
    trading_symbol: str = Field(..., description="Stock ticker symbol")
    fiscal_year_end: str = Field(..., description="Fiscal year end date (e.g., 'September 28, 2024')")
    state_of_incorporation: str = Field(..., description="State where incorporated")
    employer_id_no: str = Field(..., description="Employer Identification Number (EIN)")
    address: str = Field(..., description="Company headquarters address")
    phone_number: str = Field(..., description="Company phone number")
    exchange: str = Field(..., description="Stock exchange listing")
    primary_sector: str = Field(..., description="GICS sector of the company (e.g., Technology, Healthcare, Industrial)")


class FinancialMetrics(BaseModel):
    revenue: float = Field(..., description="Total annual revenue in USD, give full numerical float values")
    net_income: float = Field(..., description="Annual net income in USD, give full numerical float values")
    operating_cash_flow: float = Field(..., description="Operating cash flow in USD give full numerical float values")
    capital_expenditure: float = Field(..., description="Capital expenditures (CAPEX) in USD give full numerical float values")
    eps: float = Field(..., description="Diluted earnings per share (EPS), use python for calculation")
    pe_ratio: Optional[float] = Field(None, description="What is the Price to earnings ratio (P/E), use python for calculation")


class RiskAnalysis(BaseModel):
    risk_level: str = Field(..., description="Low, Medium, or High based on extracted risks")
    top_3_risk_factors: List[str] = Field(..., description="List of the top 3 most critical risk factors mentioned in Item 1A")
    mitigation_suggestions: List[str] = Field(..., description="Risk mitigation strategies based on the filing and general market knowledge")
    confidence_score: float = Field(..., description="Confidence in analysis 0-1")


class StrategicLandscape(BaseModel):
    """Extraction model for competitive environment and partnerships."""
    key_rivals: List[str] = Field(..., description="List of the company's primary competitors (3-5 names), should include name if possible")
    competitive_advantage: str = Field(..., description="Concise summary of the company's stated competitive advantage, should include name if possible")
    key_partners: List[str] = Field(..., description="List of named key suppliers, distributors, or strategic partners, should include name if possible")
    major_investments_acquisitions: List[str] = Field(..., description="List of major M&A activity or internal investments mentioned in the year, should include name if possible")

# --- NEW MODEL for Regulatory Documents ---

# class RegulatoryAnalysis(BaseModel):
#     """Structured analysis of a single directive/law document."""
#     country_region: str = Field(..., description="Country or region issuing the law (e.g., 'European Union', 'United States', 'China')")
#     law_name: str = Field(..., description="Official name of the regulation/act/directive")
#     primary_subject: str = Field(..., description="The main topic of the law (e.g., 'AI Regulation', 'Climate Change', 'Consumer Protection')")
#     key_requirements_summary: str = Field(..., description="A concise summary of the 3-5 main obligations or requirements introduced by the text.")
#     affected_sectors: List[str] = Field(..., description="List of industries most directly impacted (e.g., ['Tech', 'Automotive', 'Energy'])")
#     potential_impact_severity: str = Field(..., description="Low, Medium, or High. Estimate of the regulatory burden or market disruption.")

class RegulatoryAnalysis(BaseModel):
    """Structured analysis of a single directive/law document."""
    country_region: str = Field(..., description="Country or region issuing the law")
    law_name: str = Field(..., description="Official name of the regulation/act/directive")
    primary_subject: str = Field(..., description="The main topic of the law")
    key_requirements_summary: str = Field(..., description="A concise summary of the 3-5 main obligations or requirements")
    affected_sectors: List[str] = Field(..., description="List of industries most directly impacted")
    potential_impact_severity: str = Field(..., description="Low, Medium, or High")
    # ADD these fields for S&P 500 analysis:
    specific_companies_mentioned: List[str] = Field(default=[], description="List any S&P 500 companies explicitly mentioned")
    compliance_deadline: Optional[str] = Field(None, description="Key implementation dates or deadlines")
    estimated_compliance_cost: Optional[str] = Field(None, description="Any mentioned compliance costs or budget allocations")


# --- Helper Class (Updated with new method) ---

class BedrockInstructorHelper:
    """Helper for structured extraction with Bedrock + Instructor"""

    def __init__(self, model: str = "global.anthropic.claude-haiku-4-5-20251001-v1:0"):
        self.client = client
        self.model = model

    def extract_10k_info(self, filing_text: str) -> dict:
        """Extract administrative info from cover/Part I."""
        try:
            result = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": f"Extract administrative info from this SEC filing: {filing_text}"}],
                response_model=Company10K,
                max_retries=2
            )
            return result.model_dump()
        except Exception as e:
            print(f"Error extracting 10-K info: {e}")
            return {}

    def analyze_financials(self, financial_text: str) -> dict:
        """Extract financial metrics from MD&A or tables."""
        try:
            result = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": f"Extract key financial metrics from this text: {financial_text}"}],
                response_model=FinancialMetrics,
                max_retries=2
            )
            return result.model_dump()
        except Exception as e:
            print(f"Error analyzing financials: {e}")
            return {}

    def assess_risk(self, risk_text: str, company_symbol: str) -> dict:
        """Structured risk assessment from Item 1A text."""
        try:
            prompt = f"Company Symbol: {company_symbol}\nItem 1A Text: {risk_text}\nAnalyze risks and provide structured output."
            result = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                response_model=RiskAnalysis,
                max_retries=2
            )
            return result.model_dump()
        except Exception as e:
            print(f"Error assessing risk: {e}")
            return {}

    def analyze_strategy(self, business_text: str, sector: str) -> dict:
        """Competitive landscape, partners, and investments."""
        try:
            prompt = f"Company Sector: {sector}\nText: {business_text}\nIdentify key rivals, advantages, partners, and major investments."
            result = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                response_model=StrategicLandscape,
                max_retries=2
            )
            return result.model_dump()
        except Exception as e:
            print(f"Error analyzing strategy: {e}")
            return {}

    def analyze_regulation(self, document_text: str, document_name: Optional[str] = None, chunk_index: Optional[int] = None, total_chunks: Optional[int] = None) -> dict:
        """Structured extraction from regulatory documents with optional chunk metadata."""
        try:
            meta = f"Document: {document_name}" if document_name else ""
            if chunk_index is not None and total_chunks is not None:
                meta += f" | Chunk {chunk_index+1}/{total_chunks}"

            prompt = f"{meta}\nAnalyze the following legislative text and provide structured output:\n{document_text}"

            result = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                response_model=RegulatoryAnalysis,
                max_retries=2
            )
            return result.model_dump()
        except Exception as e:
            print(f"Error analyzing regulatory document: {e}")
            return {}

class BedrockEmbeddingHelper:
    def __init__(self, model_id: str = "amazon.titan-embed-text-v2:0", region: str = "us-west-2"):
        self.model_id = model_id
        self.region = region
        self.bedrock = boto3.client('bedrock-runtime', region_name=region)
        print(f"Embedding model: {model_id}")

    def embed_text(self, text: str) -> List[float]:
        """Generate embeddings for text"""
        if not text or not text.strip():
            return []

        try:
            text = text.strip()
            body = json.dumps({"inputText": text})
            response = self.bedrock.invoke_model(
                body=body,
                modelId=self.model_id,
                accept='application/json',
                contentType='application/json'
            )
            response_body = json.loads(response.get('body').read())
            embedding = response_body.get('embedding', [])
            return embedding
        except Exception as e:
            print(f"Embedding error: {e}")
            return []