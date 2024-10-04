from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
# Set up your WebDriver (ChromeDriver in PATH)
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
# Reconfigure stdout to use UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')
chrome_options = webdriver.ChromeOptions()
# chrome_options.add_argument("--headless")


driver = webdriver.Chrome(options=chrome_options)

# Open the webpage
driver.get(url)
product_data = {}

# Example to fetch product details (adapt the selectors based on the site's HTML)
try:
 
    
    product_name = driver.find_elements(By.CSS_SELECTOR, 'h1[data-testid="product-title"]')[-1].text

    # Get product price
    product_price = driver.find_elements(By.CSS_SELECTOR, 'div.gl-price-item.notranslate')[-1].text
    
    # Get image URL
    driver.implicitly_wait(20)
    product_image_url = driver.find_element(By.CSS_SELECTOR, 'picture[data-testid="pdp-gallery-picture"] img').get_attribute('src')

    # Output the details
    # print(product_name_element)
    # print(f"Product Name: {product_name}")
    # print(f"Product Price: {product_price}")
    # print(f"Product Image URL: {product_image_url}")
    product_data['product_name'] = product_name.strip()
    product_data['product_price'] = number = float(re.sub(r'[^\d.]', '', product_price.strip())) if '.' in product_price.strip() else int(re.sub(r'[^\d]', '', product_price.strip()))

    product_data['product_image_url'] = product_image_url.strip()

except Exception as e:
    print(f"An error occurred: {e}")

# Close the driver
# driver.quit()
print(json.dumps(product_data, ensure_ascii=False, indent=4))