import requests
from bs4 import BeautifulSoup
import json

import sys

# Reconfigure stdout to use UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')
url=''
# Get the URL from the command line arguments
if len(sys.argv) > 1:
    url = sys.argv[1]  # The URL passed as an argument
else:
    print(json.dumps({"error": "No URL provided"}))
    sys.exit(1)
# URL of the Nike product page
# url = "https://www.nike.com/in/t/air-max-1-shoes-h0SzNM/DZ2628-107"

# Fetch the HTML content of the page
response = requests.get(url)
soup = BeautifulSoup(response.text, "html.parser")

# Find the <script> tag containing the JSON-LD data
script_tag = soup.find("script", type="application/ld+json")

if script_tag:
    product_data = {}
    # Load the JSON content
    product_dataa = json.loads(script_tag.string)
    
    # Extract desired information
    product_name = product_dataa.get("name", "N/A")
    image = product_dataa.get("image", "N/A")
    low_price = product_dataa.get("offers", {}).get("lowPrice", "N/A")
    # high_price = product_dataa.get("offers", {}).get("highPrice", "N/A")
    # currency = product_dataa.get("offers", {}).get("priceCurrency", "N/A")
    # availability = product_dataa.get("offers", {}).get("availability", "N/A")
    # product_url = product_dataa.get("offers", {}).get("offers", [])[0].get("url", "N/A")
    product_data['product_name']=product_dataa.get("name", "N/A")
    product_data['product_price']=product_dataa.get("offers", {}).get("lowPrice", "N/A")
    product_data['product_image_url']=product_dataa.get("image", "N/A")
    # Print the extracted data
    print(json.dumps(product_data, ensure_ascii=False, indent=4))
else:
    print("JSON-LD data not found!")
