var cron = require("node-cron");
import sqlite3 from "sqlite3";
import nodemailer from "nodemailer";
import { open } from "sqlite";
import { exec } from "child_process";
import Redis from "ioredis";
import { MeiliSearch } from "meilisearch";
import puppeteer from "puppeteer";
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
let data = null;
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
async function scrapeblkbrdshoemakerProduct(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

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
      // args: ["--start-maximized"]
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
async function myntra(url) {
  try {
    const extractedPart = url.split("/").slice(-2)[0];
    const apiUrl = `https://www.myntra.com/gateway/v2/product/${extractedPart}`;

    browser = await puppeteer.launch({
      headless: false,
      // defaultViewport: null,
      // args: ["--start-maximized"]
    });

    const page = await browser.newPage();

    // Go to any valid HTML page to run JS fetch (cannot run fetch directly on JSON API)
    await page.goto("https://www.myntra.com", {
      waitUntil: "domcontentloaded",
    });
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
    console.error(
      "❌ There was a problem with the Puppeteer operation:",
      error
    );
    return null;
  } finally {
    if (browser) await browser.close();
  }
}
async function extractFlipkartProductData(url) {
  browser = await puppeteer.launch({ headless: true }); // Visible browser for debugging
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

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
    const productImageURL = await page.$eval(
      "img.DByuf4.IZexXJ.jLEJ7H",
      (img) => img.src
    );

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
async function scrapeNykaaProduct(url) {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      // defaultViewport: null,
    });

    const page = await browser.newPage();
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 6000 });

    // Scroll down to trigger lazy load
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    // Wait for image to load
    await page.waitForSelector(".css-z904mr", { timeout: 3000 }).catch(() => null);
    await page.waitForSelector(".css-a5kl1t", { timeout: 3000 }).catch(() => null);

    const data = await page.evaluate(() => {
      const name = document.querySelector(".css-cmh3n9")?.innerText.trim() || "N/A";

      let priceSymbol = document.querySelector(".css-a5kl1t")?.innerText || "₹";
      let priceDigits = document.querySelector(".css-a5kl1t")?.nextSibling?.textContent?.trim() || "";
      let product_price = (priceSymbol + priceDigits).replace(/[^\d]/g, "") || "N/A";

      // Prefer large display image first
      let imgElement =document.querySelector(".css-z904mr");
        
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
async function scrapeAmazonProduct(url) {
  if (!url) return { error: "No URL provided" };

  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.waitForSelector("#productTitle", { timeout: 10000 });

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
      return {
        product_name: name,
        product_price: price,
      };
    });

    const productImageURL = await page.evaluate(() => {
      return document.querySelector(".imgTagWrapper img")?.src || "";
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
// Schedule the task every 2 minutes
cron.schedule("0 */4 * * *", () => {
  updatedata();
});

console.log("Cron job initialized");

async function updatedata() {
  if (!db) {
    // If the database instance is not initialized, open the database connection
    db = await open({
      filename: "./collection.db", // Specify the database file path
      driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
    });
  }

  // //console.log("hello");
  const str = "SELECT link,transid FROM data";

  const items = await db.all(str);
  for (let x in items) {
    console.log(items[x].link);
    const domain = extractDomain(items[x].link);
    console.log(domain);
    let run = null;

    if (domain === "amazon") {
      //run = `python amazon.py "${items[x].link}"`;
      data = await scrapeAmazonProduct(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "zara") {
      data = await zara(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "ajio") {
    run = `python ajio.py "${items[x].link}"`;
    
//     data = await ajio(url.link);
//     if (data) {
//   data = JSON.parse(data);
// } else {
//   console.error("❌ Failed to get data from scraper.");
//   // Handle gracefully, maybe:
//   data = {
//     product_name: "N/A",
//     product_price: "N/A",
//     product_image_url: "N/A",
//   };
// }

  } else if (domain === "luxe") {
     run = `python luxe.py "${items[x].link}"`;
//     data = await luxe(url.link);
//     if (data) {
//   data = JSON.parse(data);
// } else {
//   console.error("❌ Failed to get data from scraper.");
//   // Handle gracefully, maybe:
//   data = {
//     product_name: "N/A",
//     product_price: "N/A",
//     product_image_url: "N/A",
//   };
// }

  }else if (domain === "converse") {
      data = await converse(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "blkbrdshoemaker") {
    data = await scrapeblkbrdshoemakerProduct(items[x].link);
    if (data) {
  data = JSON.parse(data);
} else {
  console.error("❌ Failed to get data from scraper.");
  // Handle gracefully, maybe:
  data = {
    product_name: "N/A",
    product_price: "N/A",
    product_image_url: "N/A",
  };
}

  }
  else if (domain === "nykaafashion") {
    data = await scrapeNykaaProduct(items[x].link);
    if (data) {
      data = JSON.parse(data);
    } else {
      console.error("❌ Failed to get data from scraper.");
      // Handle gracefully, maybe:
      data = {
        product_name: "N/A",
        product_price: "N/A",
        product_image_url: "N/A",
      };
    }
  }
  else if (domain === "tatacliq") {
      data = await tatacliq(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "flipkart") {
      // run = `python flipkart.py "${items[x].link}"`;
      data = await extractFlipkartProductData(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "myntra") {
      data = await myntra(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "adidas") {
      //   const extractedPart = items[x].link.split("/").pop().replace(".html", "");
      // const link = "https://www.adidas.co.in/api/products/" + extractedPart;
      // const { stdout, stderr } = await execPromise(`python adidas.py "${link}"`);
      // data = JSON.parse(stdout.trim());
      // data = {
      //   product_name: data.name,
      //   product_image_url: data.view_list[0].image_url,
      //   product_price: data.pricing_information.currentPrice,
      // };
      data = await getAdidasProductData(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "shoppersstop") {
      // const link = items[x].link;
      // const { stdout, stderr } = await execPromise(`python shopperstop.py "${link}"`);
      // data = JSON.parse(stdout.trim());
      // data = {
      //   product_name: data.product_name,
      //   product_image_url: data.product_image_url,
      //   product_price: data.product_price,
      // };
      data = await getShoppersstopProductData(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    } else if (domain === "nike") {
      // const link = items[x].link;
      // const { stdout, stderr } = await execPromise(`python nike.py "${link}"`);
      // data = JSON.parse(stdout.trim());
      // data = {
      //   product_name: data.product_name,
      //   product_image_url: data.product_image_url,
      //   product_price: data.product_price,
      // };
      data = await getNikeProductFromJsonLD(items[x].link);
      if (data) {
        data = JSON.parse(data);
      } else {
        console.error("❌ Failed to get data from scraper.");
        // Handle gracefully, maybe:
        data = {
          product_name: "N/A",
          product_price: "N/A",
          product_image_url: "N/A",
        };
      }
    }
    try {
      const now = new Date();
      const currentTime = now.toLocaleString();

      if (run != null) {
        const { stdout, stderr } = await execPromise(run);

        // Parse the JSON string returned from python
        data = JSON.parse(stdout.trim());
      }
      console.log(
        data.product_name,
        " ",
        data.product_price,
        " ",
        data.product_image_url,
        " ",
        currentTime,
        " ",
        domain,
        " ",
        items[x].link
      );
      if (
        data.product_name === "N/A" ||
        data.product_price === "N/A" ||
        data.product_image_url === "N/A" ||
        !data.product_name ||
        !data.product_price ||
        !data.product_image_url
      ) {
        continue; // Skip this item if any of the required fields are "N/A"
      }
      const strrr = `
      INSERT INTO dataprice (dataid,date, price) VALUES
       (?,?,?)
      `;
      const resultt = await db.run(strrr, [
        items[x].transid,
        currentTime,
        data.product_price,
      ]);
    } catch (error) {
      console.log("error occured ", error);
    }
  }

  const str2 =
    "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;";
  const items2 = await db.all(str2);
  client
    .index("mycart")
    .addDocuments(items2)
    .then((res) => console.log(res));
  await storeDataInRedis(str2, items2);
  let products = [];
  for (let x in items2) {
    if (
      items2[x].current_price <= items2[x].min_price &&
      items2[x].max_price != items2[x].min_price
    ) {
      let newObject = {
        name: items2[x].name,
        price: items2[x].current_price,
        imageUrl: items2[x].image,
        link: items2[x].link,
      };
      products.push(newObject);
    }
  }

  if (products.length != 0) {
    const emailBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h1 style="text-align: center; color: #007BFF;">Product's List</h1>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr>
              <th style="text-align: left; border-bottom: 2px solid #ddd; padding: 8px;">Image</th>
              <th style="text-align: left; border-bottom: 2px solid #ddd; padding: 8px;">Name</th>
              <th style="text-align: left; border-bottom: 2px solid #ddd; padding: 8px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${products
              .map(
                (product) => `
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="${product.link}">
                      <img src="${product.imageUrl}" alt="${product.name}" style="width: 70px; height: auto; border-radius: 5px;" /></a>
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;"><a href="${product.link}">${product.name}</a></td>
                    <td style="padding: 8px; border-bottom: 1px solid #ddd;">${product.price}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;
    try {
      // Create a transporter using your email service credentials
      const transporter = nodemailer.createTransport({
        service: "gmail", // Or any other email service like Yahoo, Outlook, etc.
        auth: {
          user: process.env.EMAIL_USER, // Your email address
          pass: process.env.EMAIL_PASS, // Your email password or app-specific password
        },
      });
      //    console.log(process.env.EMAIL_PASS+"*********************");
      // Define the email options
      const mailOptions = {
        from: process.env.EMAIL_USER, // Sender address
        to: "jatindahiya027@gmail.com", // Replace with recipient email
        subject: "Price Drop Alert from MyCart!", // Email subject
        html: emailBody, // Plain text content
      };

      // Send the email
      await transporter.sendMail(mailOptions);

      // Respond with success
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }
}
