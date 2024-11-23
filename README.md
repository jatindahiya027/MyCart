# MyCart <img src="./readme/logo.png" alt="Alt Text" width="25" height="25">

MyCart is a **Next.js** application designed to help you keep track of pricing data for products across multiple e-commerce platforms. By scraping prices from **Flipkart**, **Amazon**, **Zara**, **Converse**, **TataCliq**, **Ajio**, **Myntra**, and **Adidas**, MyCart enables you to monitor the price trends of your favorite items in one place.
Get frequent update on Mail when the prices are at its lowest.

<video controls width="600">
  <source src="./readme/video.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Features ✨

- **Scrape Prices**: Fetch the latest pricing data from Flipkart, Amazon, Zara, Converse, TataCliq, Ajio, Myntra, and Adidas.
- **Track Trends**: Compare high and low prices for products over time.
- **Sort & Filter**: Sort items by relevance, price, or date added.
<!-- - **Responsive Design**: Optimized for desktop and mobile viewing. -->

---

## Tech Stack 🛠️

- **Framework**: [Next.js](https://nextjs.org/) (React-based framework for fast rendering and server-side rendering)
<!-- - **Web Scraping**: [Cheerio](https://cheerio.js.org/) for DOM manipulation, and **Axios** for fetching data. -->
<!-- - **Styling**: Tailwind CSS for modern and responsive design. -->
- **Database**: [SQLite](https://www.sqlite.org/) for storing scraped data.
- **Caching**: [Redis](https://redis.io/) for data caching.
- **Animation**: [Motion](https://motion.dev/) for react animations.
- **Scraping**: [Python]() for scraping data for few websites.
<!-- - **State Management**: React's Context API for global state handling. -->

---

## Installation ⚙️

Follow these steps to set up and run the MyCart app locally:

### Prerequisites

- **Node.js** (v18+)
- **npm**
- **SQLite** (or a compatible database for storing pricing data)

### Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/jatindahiya027/MyCart.git
   cd MyCart
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**:
   Create a `.env.local` file in the root directory and configure the required variables:
   ```env
   EMAIL_USER=Your Email
   EMAIL_PASS=Your Email password or App password if you have 2 factor authentication
   ```
   Go to [App Password](https://myaccount.google.com/apppasswords) and create a new App Password.

4. **Run Database setup**:
   Set up the SQLite database:
   ```bash
   node createdb.js
   node enterdata.js
   node createindex.mjs
   ```
5. **Install Redis**:
   To use Redis locally, you'll need to install Redis on your machine, configure it, and then interact with it using a Redis client in your application. Here’s how you can set up Redis locally:

    - ### **Step 1: Install Redis Locally**

    - #### **On macOS** (via Homebrew):
    1. Install Homebrew if you haven't already: [Homebrew installation guide](https://brew.sh).
    2. Install Redis using Homebrew:
   ```bash
   brew install redis
   ```
    3. Start Redis:
     ```bash
     brew services start redis
     ```

    - #### **On Linux** (via APT):
    1. Update the package list:
   ```bash
   sudo apt update
   ```
    2. Install Redis:
   ```bash
   sudo apt install redis-server
   ```
    3. Start Redis:
   ```bash
   sudo service redis-server start
   ```

    - #### **On Windows**:
    1. Download and install Redis for Windows from [Redis on Windows](https://github.com/microsoftarchive/redis/releases).
    2. After installation, start Redis by running `redis-server.exe` from the command prompt.

    - **Check Redis Status**:
     - You can check if Redis is running by using the `redis-cli` command.
     - Run `redis-cli` and type `ping`. If Redis is running, it will respond with `PONG`.
    - Make sure redis is running on port **6379**.

6. **Install Python and dependencies**:
    Install Selenium for Python [installation guide](https://www.geeksforgeeks.org/how-to-install-selenium-in-python/) 
7. **Start the Development Server**:
   ```bash
   npm run dev
   ```

8. Open the app in your browser at [http://localhost:3000](http://localhost:3000).

9. ```bash
   npm run build
   npm start
   ```
10. Open the app in your browser at [http://localhost:3027](http://localhost:3027). 

---

## Usage 🛒

1. **Add Items**:
   - Click on **Add** button on the top right.
   - Enter the url of a product from the website supported.

2. **View Pricing Trends**:
   - A Cron job will automatically scrape data from the websites.
   - See the highest and lowest prices of products.

3. **Monitor Updates**:
   - Prices are updated periodically based on the scraping schedule.

---

## ToDo
- [x] ~~Make API faster.~~
- [x] ~~Make data Scraping faster.~~
- [x] ~~Add Animations.~~
- [x] ~~Add Filter Options.~~
- [ ] Create Search Functionality.
---
## Contribution 🤝

We welcome contributions! If you'd like to report bugs, request features, or submit a pull request:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-name`).
3. Commit changes (`git commit -m 'Add feature'`).
4. Push to the branch (`git push origin feature-name`).
5. Open a pull request.

---

## License 📜

This project is licensed under the **MIT License**. See the `LICENSE` file for more information.

---

## Screenshots 📸


 ![Dashboard View](./readme/Screenshot%202024-11-23%20162422.png)  ![Price Tracking View](./readme/Screenshot%202024-11-23%20162526.png)

---

### Author

Developed by [Jatin Dahiya](https://github.com/jatindahiya027). If you enjoy this app, please ⭐ the repository!

--- 

