import json
import time
import sys
import asyncio
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import NoSuchElementException

async def ajio(url: str) -> str | None:
    try:
        clean_url = url.split('?')[0]
        extracted_part = "/".join(clean_url.split('/')[-2:])
        json_url = f"https://luxe.ajio.com/api/{extracted_part}"
        # print(f"Navigating to API URL: {json_url}")
    except IndexError:
        print("Error: Invalid Ajio URL format.")
        return None

    chrome_options = Options()
    # chrome_options.add_argument("--headless")  # Optional: run headless
    chrome_options.add_argument("--start-maximized")

    driver = None
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.get(json_url)
        # time.sleep(3)

        pre_element = driver.find_element(By.TAG_NAME, "pre")
        pre_content = pre_element.text
        data = json.loads(pre_content)

        database = {
            "product_name": data['baseOptions'][0]['options'][0]['modelImage']['altText'],
            "product_image_url": data['baseOptions'][0]['options'][0]['modelImage']['url'],
            "product_price": data['baseOptions'][0]['options'][0]['priceData']['value'],
        }
        product_data = {}
        product_data['product_name']=database['product_name']
        product_data['product_price']=database['product_price']
        product_data['product_image_url']=database['product_image_url']
    # Print the extracted data
        print(json.dumps(product_data, ensure_ascii=False, indent=4))

        # print(json.dumps(database, indent=2))

    except (NoSuchElementException, KeyError, IndexError) as e:
        print(f"Error fetching or parsing data: {e}")
        print("The page structure or JSON format might have changed.")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None
    finally:
        if driver:
            driver.quit()

async def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <ajio_product_url>")
        return

    url = sys.argv[1]
    await ajio(url)


if __name__ == "__main__":
    asyncio.run(main())
