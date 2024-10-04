from selenium import webdriver
from selenium.webdriver.common.by import By
import sys
import re
import json


# Reconfigure stdout to use UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')
url=''
# Get the URL from the command line arguments
if len(sys.argv) > 1:
    url = sys.argv[1]  # The URL passed as an argument
else:
    print(json.dumps({"error": "No URL provided"}))
    sys.exit(1)

# Reconfigure stdout to use UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

# Set up Chrome options for headless mode
chrome_options = webdriver.ChromeOptions()

# Initialize the WebDriver
driver = webdriver.Chrome(options=chrome_options)

# Open the webpage
driver.get(url)
driver.implicitly_wait(5)
product_data = {}
# Example to fetch product details (adapt the selectors based on the site's HTML)
try:
    product_name = driver.find_element(By.CSS_SELECTOR, 'h1.pdp-name').text
    product_price = driver.find_element(By.CSS_SELECTOR, 'span.pdp-price')
    price_text = product_price.find_element(By.TAG_NAME, 'strong').text
    div_element = driver.find_element(By.CLASS_NAME, 'image-grid-image')

# Get the style attribute from the div
    style = div_element.get_attribute('style')

# Use a regular expression to extract the URL
    url_match = re.search(r'url\("?(.*?)"?\)', style)
    # print(driver.page_source)
    product_image_url=""
    if url_match:
     image_url = url_match.group(1)
     product_image_url=image_url 
    #  print(f'Image URL: {image_url}')
    # else:
    #     print('No URL found')
    # print(f"Product Name: {product_name}")
    # print(f"Product Price: {price_text}")
    # print(f"Product Image URL: {product_image_url}")
    product_data['product_name'] = product_name.strip()
    product_data['product_price'] = float(re.sub(r'[^\d.]', '', price_text.strip())) if '.' in price_text.strip() else int(re.sub(r'[^\d]', '', price_text.strip()))
    product_data['product_image_url'] = product_image_url.strip()

except Exception as e:
    print(f"An error occurred: {e}")

# Close the driver
driver.quit()
print(json.dumps(product_data, ensure_ascii=False, indent=4))