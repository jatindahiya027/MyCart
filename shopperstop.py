import requests
from bs4 import BeautifulSoup
import json
import sys

# Reconfigure stdout to use UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')
# URL of the Nike product page
url=''
# Get the URL from the command line arguments
if len(sys.argv) > 1:
    url = sys.argv[1]  # The URL passed as an argument
else:
    print(json.dumps({"error": "No URL provided"}))
    sys.exit(1)
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

response = requests.get(url, headers=headers)
# print(response.text)
soup = BeautifulSoup(response.text, "html.parser")

# Find the <script> tag with id="__NEXT_DATA__"
script_tag = soup.find("script", type="application/json")

if script_tag:
    product_data = {}
    # print(script_tag.string)
    product_dataa = json.loads(script_tag.string)
    
    product_name = product_dataa["props"]["pageProps"]["dehydratedState"]["queries"][1]["state"]["data"]["data"]["products"]["items"][0]["name"]
    image = product_dataa["props"]["pageProps"]["dehydratedState"]["queries"][1]["state"]["data"]["data"]["products"]["items"][0]["additional_images"][0]["url"]
    price = product_dataa["props"]["pageProps"]["dehydratedState"]["queries"][1]["state"]["data"]["data"]["products"]["items"][0]["variants"][0]["product"]["price_range"]["minimum_price"]["final_price"]["value"]
    product_data['product_name']=product_name
    product_data['product_price']=price
    product_data['product_image_url']=image
    # Print the extracted data
    print(json.dumps(product_data, ensure_ascii=False, indent=4))
    # print(json.dumps(script_tag, ensure_ascii=False, indent=4))
else:
    print("JSON-LD data not found!")
