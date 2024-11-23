var cron = require("node-cron");
import sqlite3 from "sqlite3";
import nodemailer from 'nodemailer';
import { open } from "sqlite";
import { exec } from "child_process";
import Redis from 'ioredis';

// Set up Redis connection
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});
let db = null;
let data = null;
async function storeDataInRedis(key, value) {
  await redis.set(key, JSON.stringify(value), 'EX', 60 * 60 ); // Cache data for 5 minutes
  console.log('Data stored in Redis');
}
async function ajio(url) {
  const extractedPart = url.split("/").slice(-2).join("/");
  // console.log(extractedPart);

  try {
    const response = await fetch("https://www.ajio.com/api/" + extractedPart); // API endpoint

    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }

    const data = await response.json(); // Parse JSON response

    const database = {
      product_name: data.baseOptions[0].options[0].modelImage.altText,
      product_image_url: data.baseOptions[0].options[0].modelImage.url,
      product_price: data.baseOptions[0].options[0].priceData.value,
    };

    return JSON.stringify(database); // Convert object to JSON string
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    return null; // Return null or handle the error appropriately
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
    const response = await fetch(
      "https://www.myntra.com/gateway/v2/product/" + extractedPart,
      {
        method: "GET",
        headers: {
          authority: "www.myntra.com",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "accept-encoding": "gzip, deflate, br, zstd",
          "accept-language": "en-US,en;q=0.6",
          "cache-control": "max-age=0",
          cookie:
            "at=ZXlKaGJHY2lPaUpJVXpJMU5pSXNJbXRwWkNJNklqRWlMQ0owZVhBaU9pSktWMVFpZlEuZXlKdWFXUjRJam9pTldFMVlXSTVNell0T0RBeE1DMHhNV1ZtTFdGbE9EUXRPVFkxWVdJM1lqRTROVE5oSWl3aVkybGtlQ0k2SW0xNWJuUnlZUzB3TW1RM1pHVmpOUzA0WVRBd0xUUmpOelF0T1dObU55MDVaRFl5WkdKbFlUVmxOakVpTENKaGNIQk9ZVzFsSWpvaWJYbHVkSEpoSWl3aWMzUnZjbVZKWkNJNklqSXlPVGNpTENKbGVIQWlPakUzTkRNek5URXpNVGtzSW1semN5STZJa2xFUlVFaWZRLkdJVjl1NVZVUmtKUEd1UmdnM0x3M2FaZmhEMi0xaGdIa1Z6ZHNIV1BOeU0=;",
          dnt: "1",
          priority: "u=0, i",
          "sec-ch-ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
      }
    ); // API endpoint

    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }

    const data = await response.json(); // Parse JSON response
    let database = null;
    if (data.style.sizes[0].sizeSellerData.length > 0) {
      database = {
        product_name: data.style.name,
        product_image_url: data.style.media.albums[0].images[0].imageURL,
        product_price: data.style.sizes[0].sizeSellerData[0].discountedPrice,
      };
    } else {
      database = {
        product_name: data.style.name,
        product_image_url: data.style.media.albums[0].images[0].imageURL,
        product_price: data.style.sizes[1].sizeSellerData[0].discountedPrice,
      };
    }

    return JSON.stringify(database); // Convert object to JSON string
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
    return null; // Return null or handle the error appropriately
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
cron.schedule("0 */2 * * *", () => {
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
      run = `python amazon.py "${items[x].link}"`;
    } else if (domain === "zara") {
      data = await zara(items[x].link);
      data = JSON.parse(data);
    } else if (domain === "ajio") {
      data = await ajio(items[x].link);
      data = JSON.parse(data);
    } else if (domain === "converse") {
      
      data = await converse(items[x].link);
      data = JSON.parse(data);
    } else if (domain === "tatacliq") {
      
      data = await tatacliq(items[x].link);
      data = JSON.parse(data);
    } else if (domain === "flipkart") {
      run = `python flipkart.py "${items[x].link}"`;
    } else if (domain === "myntra") {
      
      data = await myntra(items[x].link);
      data = JSON.parse(data);
    } else if (domain === "adidas") {
      
      const extractedPart = items[x].link.split("/").pop().replace(".html", "");
    const link = "https://www.adidas.co.in/api/products/" + extractedPart;
    const { stdout, stderr } = await execPromise(`python adidas.py "${link}"`);
    data = JSON.parse(stdout.trim());
    data = {
      product_name: data.name,
      product_image_url: data.view_list[0].image_url,
      product_price: data.pricing_information.currentPrice,
    };
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

  const str2 = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;';
  const items2 = await db.all(str2);
  await storeDataInRedis(str2, items2);
  let products = [];
  for(let x in items2){
    if(items2[x].current_price <= items2[x].min_price && items2[x].max_price != items2[x].min_price){
      let newObject = {  name: items2[x].name , price: items2[x].current_price, imageUrl: items2[x].image, link: items2[x].link };
      products.push(newObject);
    }
  }

  if(products.length != 0){

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
              .join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;
  try {
    // Create a transporter using your email service credentials
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Or any other email service like Yahoo, Outlook, etc.
      auth: {
        user: process.env.EMAIL_USER, // Your email address
        pass: process.env.EMAIL_PASS, // Your email password or app-specific password
      },
    });
 //    console.log(process.env.EMAIL_PASS+"*********************");
    // Define the email options
    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: 'jatindahiya027@gmail.com', // Replace with recipient email
      subject: 'Price Drop Alert from MyCart!', // Email subject
      html: emailBody, // Plain text content
    };
 
    // Send the email
    await transporter.sendMail(mailOptions);
 
    // Respond with success
    
  } catch (error) {
    console.error('Error sending email:', error);
    
  }
  }
}
