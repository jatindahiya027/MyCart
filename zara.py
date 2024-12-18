from selenium import webdriver
from selenium.webdriver.common.by import By
import sys
import json

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
    product_name = driver.find_element(By.CSS_SELECTOR, 'h1.product-detail-info__header-name').text
    product_prices = driver.find_elements(By.CSS_SELECTOR, 'span.money-amount__main')
    product_price='0'
    i=0
    try:
        discount = driver.find_element(By.CSS_SELECTOR, 'span.price-current__discount-percentage').text
        for price in product_prices:
            if(price.text!=''):
                product_price=price.text
                if(i>0):
                    break
                i=i+1
    except Exception as e:
        for price in product_prices:
            if(price.text!=''):
                product_price=price.text
                break
               
    driver.implicitly_wait(10)
    product_image_url = driver.find_element(By.CLASS_NAME, 'media-image__image.media__wrapper--media').get_attribute('src')

    product_data['product_name'] = product_name.strip()
    product_data['product_price'] = float(re.sub(r'[^\d.]', '', product_price.strip())) if '.' in product_price.strip() else int(re.sub(r'[^\d]', '', product_price.strip()))
    product_data['product_image_url'] = product_image_url.strip()
except Exception as e:
    print(f"An error occurred: {e}")

# Close the driver
driver.quit()
print(json.dumps(product_data, ensure_ascii=False, indent=4))