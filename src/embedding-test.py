import boto3
import json


def test_available_embedding_models():
    """Test all your available embedding models"""
    print("🔍 Testing Your Available Embedding Models...")

    # Your available models
    embedding_models = [
        'cohere.embed-v4:0',
        'amazon.titan-embed-g1-text-02',
        'amazon.titan-embed-text-v1:2:8k',
        'amazon.titan-embed-text-v1',
        'amazon.titan-embed-text-v2:0',
        'cohere.embed-english-v3:0:512',
        'cohere.embed-english-v3',
        'cohere.embed-multilingual-v3:0:512',
        'cohere.embed-multilingual-v3'
    ]

    bedrock = boto3.client('bedrock-runtime', region_name='us-west-2')
    test_text = "Hello world, this is a test for embeddings."

    working_models = []

    for model_id in embedding_models:
        print(f"\n--- Testing: {model_id} ---")
        try:
            # Determine the correct request format
            if model_id.startswith('cohere.embed-v4'):
                # Cohere Embed v4 format
                body = json.dumps({
                    "texts": [test_text],
                    "input_type": "search_document",
                    "truncate": "END"
                })
            elif model_id.startswith('cohere.'):
                # Cohere v3 format
                body = json.dumps({
                    "texts": [test_text],
                    "input_type": "search_document"
                })
            elif model_id.startswith('amazon.titan'):
                # Titan format
                body = json.dumps({
                    "inputText": test_text
                })
            else:
                # Default format
                body = json.dumps({
                    "inputText": test_text
                })

            print(f"Request format: {json.loads(body)}")

            response = bedrock.invoke_model(
                body=body,
                modelId=model_id,
                accept='application/json',
                contentType='application/json'
            )

            response_body = json.loads(response.get('body').read())
            print(f"✅ SUCCESS! Response keys: {list(response_body.keys())}")

            # Extract embedding based on model type
            if model_id.startswith('cohere'):
                embedding = response_body.get('embeddings', [[]])[0]
            else:  # titan
                embedding = response_body.get('embedding', [])

            print(f"Embedding dimensions: {len(embedding)}")
            print(f"First 3 values: {embedding[:3]}")

            working_models.append(model_id)

        except Exception as e:
            print(f"❌ Failed: {str(e)[:100]}...")
            continue

    print(f"\n🎯 WORKING MODELS ({len(working_models)}):")
    for model in working_models:
        print(f"  ✅ {model}")

    return working_models


# Test all models
working_models = test_available_embedding_models()

if working_models:
    # Create a working helper with the first working model
    class FixedEmbeddingHelper:
        def __init__(self, model_id=working_models[0]):
            self.model_id = model_id
            self.bedrock = boto3.client('bedrock-runtime', region_name='us-west-2')
            print(f"✅ Using embedding model: {model_id}")

        def embed_text(self, text: str):
            if not text or not text.strip():
                return []

            try:
                text = text.strip()

                # Choose the right request format
                if self.model_id.startswith('cohere.embed-v4'):
                    body = json.dumps({
                        "texts": [text],
                        "input_type": "search_document",
                        "truncate": "END"
                    })
                elif self.model_id.startswith('cohere.'):
                    body = json.dumps({
                        "texts": [text],
                        "input_type": "search_document"
                    })
                else:  # titan models
                    body = json.dumps({
                        "inputText": text
                    })

                response = self.bedrock.invoke_model(
                    body=body,
                    modelId=self.model_id,
                    accept='application/json',
                    contentType='application/json'
                )

                response_body = json.loads(response.get('body').read())

                # Extract embedding
                if self.model_id.startswith('cohere'):
                    embedding = response_body.get('embeddings', [[]])[0]
                else:
                    embedding = response_body.get('embedding', [])

                return embedding

            except Exception as e:
                print(f"❌ Embedding error: {e}")
                return []


    # Test the fixed helper
    print(f"\n🧪 Testing Fixed Helper with {working_models[0]}...")
    helper = FixedEmbeddingHelper()

    test_texts = [
        "Hello world",
        "This is a longer test sentence for embedding generation.",
        "Financial regulations and compliance requirements"
    ]

    for i, text in enumerate(test_texts):
        result = helper.embed_text(text)
        print(f"  Text {i + 1}: {len(result)} dimensions")

    print(f"\n🎉 Use this in your main code:")
    print(f"embed_helper = FixedEmbeddingHelper('{working_models[0]}')")