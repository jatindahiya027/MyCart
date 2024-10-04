from selenium import webdriver
from selenium.webdriver.common.by import By
import json
import sys
import re
# Reconfigure stdout to use UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')
url=''
# Get the URL from the command line arguments
if len(sys.argv) > 1:
    url = sys.argv[1]  # The URL passed as an argument
else:
    print(json.dumps({"error": "No URL provided"}))
    sys.exit(1)

# Set up Chrome options for headless mode
chrome_options = webdriver.ChromeOptions()
chrome_options.add_argument("--headless=old")

# Initialize the WebDriver
driver = webdriver.Chrome(options=chrome_options)
# url='https://www.amazon.in/dp/B0BK1457X3'
# Open the webpage
driver.get(url)
driver.implicitly_wait(5)

# Initialize an empty dictionary to store the product details
product_data = {}

# Fetch product details
try:
    product_name = driver.find_element(By.ID, 'productTitle').text
    product_prices = driver.find_elements(By.CSS_SELECTOR, 'span.a-price-whole')
    product_price='0'
    for price in product_prices:
     if(price.text!=''):
        product_price=price.text
        break
    product_image_url = driver.find_element(By.CLASS_NAME, 'imgTagWrapper')
    product_image_url = product_image_url.find_element(By.TAG_NAME, 'img').get_attribute('src')

    # Store the scraped data in the dictionary
    product_data['product_name'] = product_name.strip()
    product_data['product_price'] = float(re.sub(r'[^\d.]', '', product_price.strip())) if '.' in product_price.strip() else int(re.sub(r'[^\d]', '', product_price.strip()))
    product_data['product_image_url'] = product_image_url.strip()
    # product_data['link']=sys.argv[1]

except Exception as e:
    product_data['error'] = str(e)

# Close the driver
driver.quit()

# Convert the product data dictionary to JSON format and print it
print(json.dumps(product_data, ensure_ascii=False, indent=4))
