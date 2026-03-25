import json
import sys
import asyncio

# 🔹 Normal Selenium
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import NoSuchElementException

# 🔹 Undetected Chrome
import undetected_chromedriver as uc

sys.stdout.reconfigure(encoding='utf-8')
# ✅ Method 1: Normal Selenium (FAST)
async def ajio_selenium(url: str):
    try:
        clean_url = url.split('?')[0]
        extracted_part = "/".join(clean_url.split('/')[-2:])
        json_url = f"https://luxe.ajio.com/api/{extracted_part}"
    except IndexError:
        print("Invalid Ajio URL")
        return None

    chrome_options = Options()
    # chrome_options.add_argument("--headless")  # optional
    chrome_options.add_argument("--window-position=2000,2000")

    driver = None
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)

        driver.get(json_url)

        pre_element = driver.find_element(By.TAG_NAME, "pre")
        data = json.loads(pre_element.text)

        product = data['baseOptions'][0]['options'][0]

        product_data = {
            "product_name": product['modelImage']['altText'],
            "product_image_url": product['modelImage']['url'],
            "product_price": product['priceData']['value'],
        }

       # print("✅ Data fetched using normal Selenium")
        print(json.dumps(product_data, ensure_ascii=False, indent=4))
        return product_data

    except (NoSuchElementException, KeyError, IndexError) as e:
        print(f"⚠️ Selenium failed: {e}")
        return None
    except Exception as e:
        print(f"⚠️ Unexpected Selenium error: {e}")
        return None
    finally:
        if driver:
            driver.quit()


# ✅ Method 2: Undetected Chrome (FALLBACK)
async def ajio_undetected(url: str):
    try:
        clean_url = url.split('?')[0]
        extracted_part = "/".join(clean_url.split('/')[-2:])
        json_url = f"https://luxe.ajio.com/api/{extracted_part}"
    except IndexError:
        print("Invalid Ajio URL")
        return None

    driver = None
    try:
        options = uc.ChromeOptions()

        # Window behavior
        options.add_argument("--start-maximized")
        options.add_argument("--window-position=2000,2000")

        # Stealth
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-infobars")
        options.add_argument("--disable-extensions")

        driver = uc.Chrome(options=options, headless=False)

        # Open real page first (important for cookies)
        driver.get(url)

        # Fetch API via browser session
        data = driver.execute_script("""
            return fetch(arguments[0], {
                headers: {
                    'accept': 'application/json',
                    'x-requested-with': 'XMLHttpRequest'
                }
            })
            .then(res => res.json())
            .catch(err => null);
        """, json_url)

        if not data:
            print("❌ Undetected Chrome also failed")
            return None

        product = data.get('baseOptions', [{}])[0].get('options', [{}])[0]
        priceData = product.get('priceData', {})

        product_data = {
            "product_name": product.get('modelImage', {}).get('altText', "N/A"),
            "product_image_url": product.get('modelImage', {}).get('url', "N/A"),
            "product_price": priceData.get('discountedValue') or priceData.get('value') or "N/A",
        }

        print("🔥 Data fetched using undetected_chromedriver")
        print(json.dumps(product_data, ensure_ascii=False, indent=4))
        return product_data

    except Exception as e:
        print(f"❌ Undetected error: {e}")
        return None
    finally:
        if driver:
            driver.quit()


# ✅ MAIN LOGIC (Fallback system)
async def ajio(url: str):
    # Step 1: Try normal Selenium
    data = await ajio_selenium(url)

    # Step 2: If failed → fallback
    if not data:
        print("🔁 Switching to undetected_chromedriver...")
        data = await ajio_undetected(url)

    if not data:
        print("❌ All methods failed")

    return data


# ✅ Entry point
async def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <ajio_product_url>")
        return

    url = sys.argv[1]
    await ajio(url)


if __name__ == "__main__":
    asyncio.run(main())