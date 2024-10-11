from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService

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
# Set up Chrome options for headless mode
chrome_options = webdriver.ChromeOptions()

# chrome_options.add_argument("--headless=old")

# Initialize the WebDriver
driver = webdriver.Chrome(options=chrome_options)
# Initialize the WebDriver
# driver = webdriver.Chrome(options=chrome_options)

# Open the webpage

try:
    # Navigate to the URL
    # url = "https://www.adidas.co.in/api/products/EG4959"
    driver.get(url)

    # Locate the <pre> tag
    pre_tag = driver.find_element("tag name", "pre")
    
    # Extract the text from the <pre> tag
    json_data = pre_tag.text
    
    # Convert the string to a JSON object
    json_object = json.loads(json_data)

    # Print the JSON object
    print(json.dumps(json_object, indent=4))  # Pretty print the JSON

except Exception as e:
    print(f"An error occurred: {e}")

finally:
    # Close the driver
    driver.quit()
