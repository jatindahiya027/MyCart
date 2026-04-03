import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { exec } from "child_process";
import Redis from "ioredis";
import { MeiliSearch } from "meilisearch";
import puppeteer from 'puppeteer';
// Set up Redis connection
const redis = new Redis({
  host: "localhost",
  port: 6379,
});
const client = new MeiliSearch({
  host: "http://localhost:7700",
  // apiKey: '16bc69fa-47e4-423e-bb5e-57b5b21502f5'
});
let db = null;
async function storeDataInRedis(key, value) {
  await redis.set(key, JSON.stringify(value), "EX", 60 * 60); // Cache data for 5 minutes
  console.log("Data stored in Redis");
}
var browser = null;
async function luxe(url) {
  const extractedPart = url.split("/").slice(-2).join("/");
  const jsonUrl = "https://luxe.ajio.com/api/" + extractedPart;
  console.log("Navigating to:", jsonUrl);

  browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.goto(jsonUrl, { waitUntil: "networkidle2", timeout: 20000 });

    // Wait for content to load and extract entire body as text
    await new Promise((res) => setTimeout(res, 1500)); // add delay just in case

    const bodyText = await page.evaluate(() => document.body.innerText);

    let data = null;
    try {
      data = JSON.parse(bodyText); // sometimes <pre> isn't present, but body still has JSON
    } catch (jsonError) {
      console.error("JSON parse failed:", jsonError.message);
      throw new Error("Response not JSON format");
    }

    const product = data.baseOptions?.[0]?.options?.[0];
    const priceData = product?.priceData;

    const database = {
      product_name: product?.modelImage?.altText || "N/A",
      product_image_url: product?.modelImage?.url || "N/A",
      product_price: priceData?.discountedValue || priceData?.value || "N/A",
    };

    await browser.close();
    return JSON.stringify(database);
  } catch (error) {
    console.error("Error fetching or parsing data:", error.message);
    await browser.close();
    return null;
  }
  finally{
    if (browser) {
      await browser.close();
    }
  }
}
async function ajio(url) {
  const extractedPart = url.split("/").slice(-2).join("/");
  const jsonUrl = "https://www.ajio.com/api/" + extractedPart;
  console.log("Navigating to:", jsonUrl);

  browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.goto(jsonUrl, { waitUntil: "networkidle2", timeout: 1500 });

    // Wait for content to load and extract entire body as text
    await new Promise((res) => setTimeout(res, 3000)); // add delay just in case

    const bodyText = await page.evaluate(() => document.body.innerText);

    let data = null;
    try {
      data = JSON.parse(bodyText); // sometimes <pre> isn't present, but body still has JSON
    } catch (jsonError) {
      console.error("JSON parse failed:", jsonError.message);
      throw new Error("Response not JSON format");
    }

    const product = data.baseOptions?.[0]?.options?.[0];
    const priceData = product?.priceData;

    const database = {
      product_name: product?.modelImage?.altText || "N/A",
      product_image_url: product?.modelImage?.url || "N/A",
      product_price: priceData?.discountedValue || priceData?.value || "N/A",
    };

    await browser.close();
    return JSON.stringify(database);
  } catch (error) {
    console.error("Error fetching or parsing data:", error.message);
    await browser.close();
    return null;
  }
  finally{
    if (browser) {
      await browser.close();
    }
  }
}
async function scrapeblkbrdshoemakerProduct(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
          headless: false,
      defaultViewport: null,
       args: ["--start-maximized", "--window-position=2000,2000"],
          // headless: "new",
          // args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

    const page = await browser.newPage();
    console.log("Navigating to:", url);
    await page.goto(url, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
    // Allow time for lazy-loaded content
    await new Promise((res) => setTimeout(res, 2000));

    const data = await page.evaluate(() => {
      const product_name = document.querySelector("h1.ProductMeta__Title")?.innerText.trim() || "N/A";

      const rawPrice = document.querySelector("span.money")?.innerText.trim() || "";
      const product_price = rawPrice.replace(/[^\d]/g, "") || "N/A";

      const imgElement = document.querySelector(".Product__Slideshow img.Image--lazyLoaded");
      let product_image_url = "N/A";

      if (imgElement) {
        product_image_url =
          imgElement.getAttribute("data-original-src") ||
          imgElement.getAttribute("src") ||
          imgElement.getAttribute("data-src");

        if (product_image_url && product_image_url.startsWith("//")) {
          product_image_url = "https:" + product_image_url;
        }
      }

      return { product_name, product_price, product_image_url };
    });

    console.log("Scraped Data:", data);
    return JSON.stringify(data);
  } catch (error) {
    console.error("Error scraping product:", error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
async function getAdidasProductData(productUrl) {
  try {
    const extractedPart = productUrl.split("/").pop().replace(".html", "");
    const apiUrl = "https://www.adidas.co.in/api/products/" + extractedPart;

    browser = await puppeteer.launch({
      headless: false, // Set to true if you want it headless
      // defaultViewport: null,
      // args: ["--start-maximized"],
    });

    const page = await browser.newPage();
    await page.goto(apiUrl, { waitUntil: "domcontentloaded" });

    const preTagContent = await page.$eval("pre", (el) => el.textContent);
    const jsonData = JSON.parse(preTagContent);

    const productData = {
      product_name: jsonData.name,
      product_image_url: jsonData.view_list[0].image_url,
      product_price: jsonData.pricing_information.currentPrice,
    };

    console.log("✅ Product Data:", productData);

    await browser.close();
    return JSON.stringify(productData);
  } catch (error) {
    console.error("❌ Error fetching product data:", error);
    return null;
  }
  finally {
      if (browser) 
        await browser.close();
    
  }
}
async function getShoppersstopProductData(productUrl) {
  try {
    browser = await puppeteer.launch({
      headless: true, // Run in headless mode for performance
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      // defaultViewport: { width: 1280, height: 800 }, // Set a reasonable viewport size
    });

    const page = await browser.newPage();

    // Set a realistic User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36"
    );

    await page.goto(productUrl, { waitUntil: "domcontentloaded" });

    // Extract the content of the <script type="application/json"> tag
    const jsonText = await page.$$eval(
      'script[type="application/json"]',
      (scripts) => {
        for (const script of scripts) {
          try {
            const content = JSON.parse(script.textContent);
            if (content.props?.pageProps?.dehydratedState?.queries) {
              return script.textContent;
            }
          } catch (e) {}
        }
        return null;
      }
    );

    if (!jsonText) {
      console.log("❌ Could not find required JSON script tag.");
      await browser.close();
      return null;
    }

    const jsonData = JSON.parse(jsonText);

    const productInfo =
      jsonData.props.pageProps.dehydratedState.queries[1].state.data.data
        .products.items[0];

    const productData = {
      product_name: productInfo.name,
      product_image_url: productInfo.additional_images[0].url,
      product_price:
        productInfo.variants[0].product.price_range.minimum_price.final_price
          .value,
    };

    console.log("✅ Product Data:", productData);

    await browser.close();
    return JSON.stringify(productData);
  } catch (error) {
    console.error("❌ Error fetching product data:", error);
    return null;
  }
  finally {
      if (browser) 
        await browser.close();
    
  }
}
async function getNikeProductFromJsonLD(productUrl) {
  try {
    browser = await puppeteer.launch({
      headless: true, // Set to true for headless mode
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Optional: Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36"
    );

    await page.goto(productUrl, { waitUntil: "domcontentloaded" });

    // Extract JSON-LD content from the <script type="application/ld+json">
    const jsonLDText = await page.$$eval(
      'script[type="application/ld+json"]',
      (scripts) => {
        for (const script of scripts) {
          try {
            const content = JSON.parse(script.textContent);
            if (content["@type"] === "Product") {
              return script.textContent;
            }
          } catch (e) {}
        }
        return null;
      }
    );

    if (!jsonLDText) {
      console.log("❌ JSON-LD <script> not found!");
      await browser.close();
      return null;
    }

    const jsonData = JSON.parse(jsonLDText);

    const productData = {
      product_name: jsonData.name || "N/A",
      product_image_url: jsonData.image || "N/A",
      product_price: jsonData.offers?.lowPrice || "N/A",
    };

    console.log("✅ Product Data:", productData);

    await browser.close();
    return JSON.stringify(productData);
  } catch (error) {
    console.error("❌ Error fetching product data:", error);
    return null;
  }
  finally {
      if (browser) 
        await browser.close();
    
  }
}
async function zara(url) {
  try {
    const response = await fetch(url + "&ajax=true"); // API endpoint

    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }

    const data = await response.json(); // Parse JSON response

    const database = {
      product_name: data.product.name,
      product_image_url:
        data.product.detail.colors[0].xmedia[0].extraInfo.deliveryUrl,
      product_price: data.product.detail.colors[0].price / 100,
    };

    return JSON.stringify(database); // Convert object to JSON string
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    return null; // Return null or handle the error appropriately
  }
}
async function converse(url) {
  try {
    const extractedPart = url.split("/").pop().replace(".html", "");
    const response = await fetch(
      "https://www.converse.in/graphql?query=query+getProductDetailForProductPage%28%24urlKey%3AString%21%29%7Bproducts%28filter%3A%7Burl_key%3A%7Beq%3A%24urlKey%7D%7D%29%7Bitems%7Bid+uid+...ProductDetailsFragment+__typename%7D__typename%7D%7Dfragment+ProductDetailsFragment+on+ProductInterface%7B__typename+categories%7Buid+breadcrumbs%7Bcategory_uid+__typename%7Dname+__typename%7Dcreated_at+updated_at+description%7Bhtml+__typename%7Dshort_description%7Bhtml+__typename%7Did+uid+countdown_timer_date+media_gallery_entries%7Buid+label+position+disabled+file+video_content%7Bvideo_url+__typename%7D__typename%7Dmeta_title+meta_keyword+meta_description+robots_follow+name+product_tag+product_sub_type_label+product_sub_type+size_chart_identifier+product_color_label+price%7BregularPrice%7Bamount%7Bcurrency+value+__typename%7D__typename%7D__typename%7Dprice_range%7Bmaximum_price%7Bfinal_price%7Bcurrency+value+__typename%7D__typename%7D__typename%7Dprice_range%7Bminimum_price%7Bdiscount%7Bamount_off+percent_off+__typename%7Dfinal_price%7Bcurrency+value+__typename%7Dregular_price%7Bcurrency+value+__typename%7D__typename%7D__typename%7Doos_price_range%7Bminimum_price%7Bdiscount%7Bamount_off+percent_off+__typename%7Dfinal_price%7Bcurrency+value+__typename%7Dregular_price%7Bcurrency+value+__typename%7D__typename%7D__typename%7Dreview_count+rating_summary+sku+small_image%7Burl+__typename%7Dstock_status+url_key+url_suffix+custom_attributes%7Bselected_attribute_options%7Battribute_option%7Buid+label+is_default+__typename%7D__typename%7Dentered_attribute_value%7Bvalue+__typename%7Dattribute_metadata%7Buid+code+label+attribute_labels%7Bstore_code+label+__typename%7Ddata_type+is_system+entity_type+ui_input%7Bui_input_type+is_html_allowed+__typename%7D...on+ProductAttributeMetadata%7Bused_in_components+__typename%7D__typename%7D__typename%7D...on+ConfigurableProduct%7Bconfigurable_options%7Battribute_code+attribute_id+uid+label+values%7Buid+default_label+label+store_label+use_default_value+value_index+swatch_data%7B...on+ImageSwatchData%7Bthumbnail+__typename%7Dvalue+__typename%7D__typename%7D__typename%7Dvariants%7Battributes%7Bcode+value_index+__typename%7Dproduct%7Bid+uid+name+updated_at+created_at+media_gallery_entries%7Buid+disabled+file+label+position+__typename%7Dsmall_image%7Burl+__typename%7Dsku+stock_status+price%7BregularPrice%7Bamount%7Bcurrency+value+__typename%7D__typename%7D__typename%7Dprice_range%7Bmaximum_price%7Bfinal_price%7Bcurrency+value+__typename%7D__typename%7Dminimum_price%7Bdiscount%7Bamount_off+percent_off+__typename%7Dfinal_price%7Bcurrency+value+__typename%7Dregular_price%7Bcurrency+value+__typename%7D__typename%7D__typename%7Doos_price_range%7Bminimum_price%7Bdiscount%7Bamount_off+percent_off+__typename%7Dfinal_price%7Bcurrency+value+__typename%7Dregular_price%7Bcurrency+value+__typename%7D__typename%7D__typename%7Dcustom_attributes%7Bselected_attribute_options%7Battribute_option%7Buid+label+is_default+__typename%7D__typename%7Dentered_attribute_value%7Bvalue+__typename%7Dattribute_metadata%7Buid+code+label+attribute_labels%7Bstore_code+label+__typename%7Ddata_type+is_system+entity_type+ui_input%7Bui_input_type+is_html_allowed+__typename%7D...on+ProductAttributeMetadata%7Bused_in_components+__typename%7D__typename%7D__typename%7D__typename%7D__typename%7Dcolor_variants%7Bid+url_key+image_url+is_available+is_current+__typename%7D__typename%7D%7D&operationName=getProductDetailForProductPage&variables=%7B%22urlKey%22%3A%22" +
        extractedPart +
        "%22%7D"
    ); // API endpoint

    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }

    const data = await response.json(); // Parse JSON response

    const database = {
      product_name: data.data.products.items[0].name,
      product_image_url:
        "https://www.converse.in/media/catalog/product" +
        data.data.products.items[0].media_gallery_entries[0].file,
      product_price:
        data.data.products.items[0].price_range.minimum_price.final_price.value,
    };

    return JSON.stringify(database); // Convert object to JSON string
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    return null; // Return null or handle the error appropriately
  }
}
async function scrapeNykaaProduct(url) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized", "--window-position=2000,2000"],
      // defaultViewport: null,
    });

    const page = await browser.newPage();
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Scroll down to trigger lazy load
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    // Wait for image to load
    await page.waitForSelector(".css-z904mr", { timeout: 3000 }).catch(() => null);
    await page.waitForSelector(".css-a5kl1t", { timeout: 3000 }).catch(() => null);

    const data = await page.evaluate(() => {
      const name = document.querySelector(".css-ef32ai")?.innerText.trim() || "N/A";

      let priceSymbol = document.querySelector(".css-a5kl1t")?.innerText || "₹";
      let priceDigits = document.querySelector(".css-a5kl1t")?.nextSibling?.textContent?.trim() || "";
      let product_price = (priceSymbol + priceDigits).replace(/[^\d]/g, "") || "N/A";

      // Prefer large display image first
      let imgElement =document.querySelector(".css-kwk7lt");
        
      console.log(imgElement);
      let product_image_url = "N/A";
      if (imgElement) {
        product_image_url = imgElement.getAttribute("src") || "N/A";
      }

      return { product_name: name, product_price, product_image_url };
    });

    console.log("Scraped Data:", data);
    return JSON.stringify(data);
  } catch (error) {
    console.error("Error scraping Nykaa product:", error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
async function myntra(url) {
  try {
    const extractedPart = url.split("/").filter(seg => /^\d+$/.test(seg)).pop();
    const apiUrl = `https://www.myntra.com/gateway/v2/product/${extractedPart}`;

     browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized", "--window-position=2000,2000"]
    });

    const page = await browser.newPage();

    // Go to any valid HTML page to run JS fetch (cannot run fetch directly on JSON API)
    await page.goto("https://www.myntra.com", { waitUntil: "domcontentloaded" });
    // console.log(apiUrl);
    const data = await page.evaluate(async (apiUrl) => {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error("Network response was not ok " + response.statusText);
      }
      return await response.json();
    }, apiUrl);
    // console.log(data);
    let database;
    // if (data.style.sizes[0].sizeSellerData.length > 0) {
    //   database = {
    //     product_name: data.style.name,
    //     product_image_url: data.style.media.albums[0].images[0].imageURL,
    //     product_price: data.style.sizes[0].sizeSellerData[0].discountedPrice,
    //   };
    //   console.log("here");
    // } else {
      database = {
        product_name: data.style.name,
        product_image_url: data.style.media.albums[0].images[0].imageURL,
        product_price: data?.style?.sizes?.[0]?.sizeSellerData?.[0]?.discountedPrice ?? data?.style?.mrp,
      };
      // console.log("there");
    // }

    await browser.close();
    return JSON.stringify(database);

  } catch (error) {
    console.error("❌ There was a problem with the Puppeteer operation:", error);
    return null;
  }
  finally {
      if (browser) 
        await browser.close();
    
  }
}
async function extractFlipkartProductData(url) {
  browser = await puppeteer.launch({ headless: false,
      defaultViewport: null,
      args: ["--start-maximized", "--window-position=2000,2000"] }); // Visible browser for debugging
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Get product name and price from JSON-LD
    const productInfo = await page.$$eval(
      'script[type="application/ld+json"]',
      (scripts) => {
        let result = {};

        for (const script of scripts) {
          try {
            const json = JSON.parse(script.innerText);
            const items = Array.isArray(json) ? json : [json];

            for (const item of items) {
              if (
                item["@type"] === "Product" &&
                item.name &&
                item.offers &&
                item.offers.price
              ) {
                result.product_name = item.name;
                result.product_price = item.offers.price;
                return result;
              }
            }
          } catch (e) {
            continue;
          }
        }
        return null;
      }
    );

    // Get image URL from the DOM using the provided class
    const productImageURL = await page.evaluate(() => {
  const source = document.querySelector("picture source");
  
  if (source) {
    const srcset = source.getAttribute("srcset") || "";
    return srcset.split(",")[0].split(" ")[0];
  }

  // fallback to img
  const img = document.querySelector("picture img");
  return img?.src || null;
});

    const finalData = {
      product_name: productInfo?.product_name || "N/A",
      product_price: productInfo?.product_price || "N/A",
      product_image_url: productImageURL || "N/A",
    };

    console.log(JSON.stringify(finalData, null, 2));
    return JSON.stringify(finalData);
  } catch (error) {
    console.error("❌ Error extracting product data:", error.message);
    return null;
  } finally {
      if (browser) 
        await browser.close();
    
  }
}
async function scrapeAmazonProduct(url) {
  if (!url) return JSON.stringify({ error: "No URL provided" });

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized", "--window-position=2000,2000"],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9",
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // 🔥 HANDLE CONTINUE SHOPPING (robust)
    try {
      // wait for either product OR button
      await Promise.race([
        page.waitForSelector("#productTitle", { timeout: 7000 }),
        page.waitForSelector("button.a-button-text", { timeout: 7000 }),
      ]);

      const continueBtn = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button.a-button-text"));
        const btn = buttons.find(b =>
          b.innerText.toLowerCase().includes("continue")
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (continueBtn) {
        console.log("⚠️ Clicked Continue Shopping");

        await page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      }
    } catch (e) {
      // no button, continue normally
    }

    // 🔥 ENSURE PRODUCT PAGE LOAD
    let loaded = false;
    for (let i = 0; i < 3; i++) {
      try {
        await page.waitForSelector("#productTitle", { timeout: 15000 });
        loaded = true;
        break;
      } catch {
        console.log("⏳ Retrying...");
        await page.reload({ waitUntil: "domcontentloaded" });
      }
    }

    if (!loaded) {
      throw new Error("Product page not loaded");
    }

    // 🔥 SCRAPE
    const productInfo = await page.evaluate(() => {
      const name =
        document.querySelector("#productTitle")?.innerText.trim() || "";

      let price = "";
      const prices = document.querySelectorAll("span.a-price-whole");

      for (const p of prices) {
        const text = p.innerText.replace(/[^\d]/g, "");
        if (text) {
          price = text;
          break;
        }
      }

      const image =
        document.querySelector(".imgTagWrapper img")?.src || "";

      return {
        product_name: name,
        product_price: price,
        product_image_url: image,
      };
    });

    const finalData = {
      product_name: productInfo.product_name || "N/A",
      product_price: productInfo.product_price || "N/A",
      product_image_url: productInfo.product_image_url || "N/A",
    };

    console.log(JSON.stringify(finalData, null, 2));

    return JSON.stringify(finalData);

  } catch (error) {
    console.error("❌ Error:", error.message);
    return JSON.stringify({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
}
async function tatacliq(url) {
  try {
    const extractedPart = url.split("/").slice(-1)[0].replace("p-", "");
    const response = await fetch(
      "https://www.tatacliq.com/marketplacewebservices/v2/mpl/products/productDetails/" +
        extractedPart +
        "?isPwa=true&isMDE=true&isDynamicVar=true"
    ); // API endpoint

    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }

    const data = await response.json(); // Parse JSON response

    const database = {
      product_name: data.productName,
      product_image_url:
        "https:" + data.galleryImagesList[0].galleryImages[0].value,
      product_price: data.winningSellerPrice.value,
    };

    return JSON.stringify(database); // Convert object to JSON string
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    return null; // Return null or handle the error appropriately
  }
}
async function luxurytatacliq(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Network response was not ok: " + response.statusText);
    }

    const html = await response.text();

    // Extract window.initialData from the script tag
    const match = html.match(/window\.initialData\s*=\s*(\{[\s\S]*?\})(?=\s*<\/script>)/);
    if (!match) {
      throw new Error("Could not find window.initialData in page");
    }

    const initialData = JSON.parse(match[1]);
    const product = initialData.productDescriptionData;

    const database = {
      product_name: product.productName,
      product_image_url: "https:" + product.galleryImagesList[0].galleryImages[0].value,
      product_price: product.winningSellerPrice.value,
      // product_currency: product.winningSellerPrice.currencySymbol,
      // product_price_formatted: product.winningSellerPrice.commaFormattedValueNoDecimal,
    };

    return JSON.stringify(database);
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    return null;
  }
}
function extractDomain(url) {
  const regex = /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i; // Regex to match the domain
  const match = url.match(regex);
  return match ? match[1].split(".")[0] : null; // Return the first part of the domain
}

function execPromise(command) {
  console.log(command);
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

const FETCH_QUERY =
  "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;";

export async function POST(request) {
  const { transid, link, selectedOption } = await request.json();

  if (!transid || !link) {
    return new Response(
      JSON.stringify({ error: "transid and link are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!db) {
    db = await open({ filename: "./collection.db", driver: sqlite3.Database });
  }

  const domain = extractDomain(link);
  let run = null;
  let data = null;

  try {
    if (domain === "amazon") {
      data = await scrapeAmazonProduct(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "blkbrdshoemaker") {
      data = await scrapeblkbrdshoemakerProduct(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "nykaafashion") {
      data = await scrapeNykaaProduct(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "zara") {
      data = await zara(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "ajio") {
      run = `python ajio.py "${link}"`;
    } else if (domain === "luxe") {
      run = `python luxe.py "${link}"`;
    } else if (domain === "converse") {
      data = await converse(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "tatacliq") {
      data = await tatacliq(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "luxury") {
      data = await luxurytatacliq(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "flipkart") {
      data = await extractFlipkartProductData(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "myntra") {
      data = await myntra(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "adidas") {
      data = await getAdidasProductData(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "shoppersstop") {
      data = await getShoppersstopProductData(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    } else if (domain === "nike") {
      data = await getNikeProductFromJsonLD(link);
      if (data) {
        data = JSON.parse(data);
      } else {
        data = { product_name: "N/A", product_price: "N/A", product_image_url: "N/A" };
      }
    }

    // Python-subprocess domains (ajio, luxe)
    if (run != null) {
      const { stdout, stderr } = await execPromise(run);
      data = JSON.parse(stdout.trim());
    }

    if (
      !data ||
      data.product_price === "N/A" ||
      data.product_name === "N/A" ||
      data.product_image_url === "N/A" ||
      !data.product_name ||
      !data.product_price ||
      !data.product_image_url
    ) {
      return new Response(
        JSON.stringify({ error: "Could not fetch a valid price for this item." }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    const currentTime = new Date().toLocaleString();

    // Insert price into dataprice using the EXISTING transid — never creates a new data row
    await db.run(
      "INSERT INTO dataprice (dataid, date, price) VALUES (?, ?, ?)",
      [transid, currentTime, data.product_price]
    );

    const items = await db.all(FETCH_QUERY);
    await storeDataInRedis(FETCH_QUERY, items);

    try {
      client.index("mycart").delete({}).then(() => client.index("mycart").addDocuments(items));
    } catch (err) {
      console.log(err);
    }

    return new Response(JSON.stringify(items), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("scrapeitem error:", error);
    return new Response(
      JSON.stringify({ error: error?.stderr || error?.message || "An error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
