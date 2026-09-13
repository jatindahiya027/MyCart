import json
import unittest
import warnings
from types import SimpleNamespace
from unittest.mock import patch

warnings.filterwarnings(
    "ignore",
    message=r"The 'strip_cdata' option of HTMLParser\(\) has never done anything.*",
    category=DeprecationWarning,
)

from scrapling.parser import Selector

from scrapers.scrape_product import (
    STORE_REGISTRY,
    Product,
    ScrapeError,
    fetch_http,
    normalize_image,
    normalize_price,
    product_from_acer_payload,
    product_from_embedded_json,
    product_from_adidas_page,
    product_from_json_ld,
    product_from_malformed_json_ld,
    product_from_meesho_payload,
    product_from_mothercare_listing_page,
    product_from_myntra_state,
    product_from_nothing_state,
    product_from_normal_browser_page,
    product_from_page,
    product_from_realme_payload,
    product_from_shopify,
    product_from_tatacliq_state,
    product_from_thecollective_state,
    product_from_thesouledstore_payload,
    product_from_wildcraft_payload,
    scrape_product,
    site_from_url,
    validate_url,
)


class ProductScraperTests(unittest.TestCase):
    def setUp(self):
        warnings.filterwarnings("ignore", category=DeprecationWarning)

    def test_special_subdomains_are_classified_correctly(self):
        self.assertEqual(site_from_url("https://luxe.ajio.com/item/p/1"), "luxe")
        self.assertEqual(site_from_url("https://luxury.tatacliq.com/item/p-1"), "luxury")
        self.assertEqual(site_from_url("https://www.amazon.in/dp/ABC"), "amazon")

    def test_every_registered_store_url_is_supported(self):
        for store in STORE_REGISTRY:
            with self.subTest(store=store["name"]):
                self.assertEqual(site_from_url(store["baseUrl"]), store["site"])

    def test_unknown_store_is_rejected(self):
        with self.assertRaisesRegex(ScrapeError, "Unsupported store"):
            scrape_product("https://unsupported.example/products/item")

    def test_price_normalization_handles_indian_currency(self):
        self.assertEqual(normalize_price("₹12,999.00"), 12999)
        self.assertEqual(normalize_price("Rs. 6,600"), 6600)
        self.assertIsNone(normalize_price("N/A"))

    def test_narrow_vegnonveg_thumbnail_is_upgraded_to_complete_asset(self):
        image = normalize_image(
            "https://images.vegnonveg.com/resized/510X765/15749/shoe.jpg?format=webp",
            "https://www.vegnonveg.com/products/shoe",
        )

        self.assertEqual(
            image,
            "https://images.vegnonveg.com/resized/680X800/15749/shoe.jpg?format=webp",
        )

    def test_json_ld_price_specification_accepts_a_list(self):
        page = Selector(
            '''
            <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "Wooden Shelf",
              "image": "https://example.com/shelf.jpg",
              "offers": {
                "priceSpecification": [
                  {"@type": "UnitPriceSpecification", "price": "7,499"}
                ]
              }
            }
            </script>
            ''',
            url="https://shop.example.com/product/shelf",
        )

        product = product_from_json_ld(page, "https://shop.example.com/product/shelf")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 7499)

    def test_json_ld_prefers_low_price_over_crossed_out_high_price(self):
        page = Selector(
            '''<script type="application/ld+json">{
              "@type": "Product",
              "name": "Sale Product",
              "image": "https://example.com/sale.jpg",
              "offers": {"lowPrice": "799", "highPrice": "1299"}
            }</script>'''
        )

        product = product_from_json_ld(page, "https://example.com/sale")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 799)

    def test_json_ld_does_not_use_a_member_only_price(self):
        page = Selector(
            '''<script type="application/ld+json">{
              "@type": "Product",
              "name": "Oversized Fit Cotton T-shirt - White",
              "image": "https://image.hm.com/t-shirt.jpg",
              "offers": {
                "price": 1499,
                "priceSpecification": {
                  "@type": "UnitPriceSpecification",
                  "price": 1119,
                  "validForMemberTier": {"@type": "MemberProgramTier"}
                }
              }
            }</script>'''
        )

        product = product_from_json_ld(page, "https://www2.hm.com/product")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 1499)

    @patch("scrapers.scrape_product.fetch_json")
    def test_shopify_uses_requested_variant_price_and_image(self, fetch_json_mock):
        fetch_json_mock.return_value = {
            "title": "Serum Tint",
            "price": 129900,
            "featured_image": "//cdn.example.com/default.jpg",
            "variants": [
                {"id": 10, "price": 129900, "available": True},
                {
                    "id": 20,
                    "price": 89900,
                    "available": True,
                    "featured_image": {"src": "//cdn.example.com/selected.jpg"},
                },
            ],
        }

        product = product_from_shopify("https://shop.example/products/tint?variant=20")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 899)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/selected.jpg")

    def test_souled_store_combines_static_product_and_live_pricing(self):
        product = product_from_thesouledstore_payload(
            {
                "product": "Spider-Man: Web of Destiny",
                "images": ["1784005397_7686260.jpg"],
            },
            {"price": 899, "spl_price": 0, "exclusive_price": 849, "mrp": 999},
            "https://www.thesouledstore.com/product/spider-man-the-web-men-tshirt",
        )

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Spider-Man: Web of Destiny")
        self.assertEqual(product.product_price, 899)
        self.assertEqual(
            product.product_image_url,
            "https://prod-img.thesouledstore.com/public/theSoul/uploads/catalog/product/1784005397_7686260.jpg",
        )

    def test_collective_reads_product_from_next_flight_state(self):
        page = Selector(
            r'''<script>self.__next_f.push([1,"\"productDetails\":{\"ProductID\":1197062,\"Name\":\"Men Blue Custom Slim Fit Polo\",\"Price\":\"29500.00\",\"SellingPrice\":\"23600.00\",\"Media\":{\"Images\":[{\"Extension\":\"jpg\",\"Position\":1,\"Name\":\"1197062-25182132\"}]}}"])</script>'''
        )

        product = product_from_thecollective_state(
            page,
            "https://www.thecollective.in/p/product-1197062.html",
        )

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Men Blue Custom Slim Fit Polo")
        self.assertEqual(product.product_price, 23600)
        self.assertEqual(
            product.product_image_url,
            "https://imagescdn.thecollective.in/img/app/product/1/1197062-25182132.jpg",
        )

    def test_nothing_reads_selected_variant_from_remix_state(self):
        flat = [
            {"_1": 2},
            "loaderData",
            {"_3": 4},
            "product",
            {"_5": 6, "_7": 8, "_9": 10, "_11": 12},
            "handle",
            "phone-4a",
            "title",
            "Phone (4a)",
            "selectedOrFirstAvailableVariant",
            {"_13": 14, "_15": 16},
            "featuredImage",
            {"_17": 18},
            "price",
            {"_19": 20, "_21": 22},
            "image",
            {"_17": 23},
            "url",
            "https://cdn.example.com/fallback.png",
            "amount",
            "27999.0",
            "currencyCode",
            "INR",
            "https://cdn.example.com/selected.png",
        ]
        encoded = json.dumps(json.dumps(flat))
        page = Selector(
            f"<script>window.__reactRouterContext.streamController.enqueue({encoded})</script>"
        )

        product = product_from_nothing_state(
            page,
            "https://in.nothing.tech/products/phone-4a?Colour=White&Capacity=8%2B128GB",
        )

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Phone (4a)")
        self.assertEqual(product.product_price, 27999)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/selected.png")

    def test_realme_uses_lowest_selling_variant_and_first_overview_image(self):
        product = product_from_realme_payload(
            {
                "data": {
                    "white-256": {
                        "productName": "realme 16 5G",
                        "price": 42999,
                        "originOverviewUri": "https://cdn.example.com/white.png;https://cdn.example.com/white-2.png",
                    },
                    "black-128": {
                        "productName": "realme 16 5G",
                        "price": 36999,
                        "originOverviewUri": "https://cdn.example.com/black.png",
                    },
                }
            },
            "https://buy.realme.com/in/goods/799",
        )

        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 36999)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/black.png")

    @patch("scrapers.scrape_product.Fetcher.get")
    def test_http_fetch_stops_after_chrome_succeeds(self, fetch):
        chrome_response = SimpleNamespace(status=200)
        fetch.return_value = chrome_response

        response = fetch_http("https://shop.example.com/product")

        self.assertIs(response, chrome_response)
        self.assertEqual(
            [request.kwargs["impersonate"] for request in fetch.call_args_list],
            ["chrome"],
        )
        self.assertNotIn("doh_url", fetch.call_args.kwargs)

    @patch("scrapers.scrape_product.Fetcher.get")
    def test_blkbrd_http_fetch_uses_public_dns_over_https(self, fetch):
        fetch.return_value = SimpleNamespace(status=200)

        fetch_http(
            "https://www.blkbrdshoemaker.com/products/luigi-double-monk-strap-chestnut.js"
        )

        self.assertEqual(
            fetch.call_args.kwargs["doh_url"],
            "https://cloudflare-dns.com/dns-query",
        )

    @patch("scrapers.scrape_product.Fetcher.get")
    def test_http_fetch_stops_after_safari_recovers_from_chrome_403(self, fetch):
        safari_response = SimpleNamespace(status=200)
        fetch.side_effect = [SimpleNamespace(status=403), safari_response]

        response = fetch_http("https://shop.example.com/product")

        self.assertIs(response, safari_response)
        self.assertEqual(
            [request.kwargs["impersonate"] for request in fetch.call_args_list],
            ["chrome", "safari"],
        )

    @patch("scrapers.scrape_product.Fetcher.get")
    def test_http_fetch_uses_firefox_after_two_403_responses(self, fetch):
        firefox_response = SimpleNamespace(status=200)
        fetch.side_effect = [
            SimpleNamespace(status=403),
            SimpleNamespace(status=403),
            firefox_response,
        ]

        response = fetch_http("https://shop.example.com/product")

        self.assertIs(response, firefox_response)
        self.assertEqual(
            [request.kwargs["impersonate"] for request in fetch.call_args_list],
            ["chrome", "safari", "firefox"],
        )

    @patch("scrapers.scrape_product.fetch_json")
    @patch("scrapers.scrape_product.fetch_http")
    @patch("scrapers.scrape_product.fetch_browser")
    def test_zara_uses_one_focused_product_page_request(
        self, fetch_browser, fetch_http, fetch_json
    ):
        page = Selector(
            "<html><head>"
            '<meta property="og:image" content="https://static.zara.net/shirt.jpg">'
            "</head><body>"
            '<h1 class="product-detail-info__header-name">REGULAR FIT SHIRT</h1>'
            '<span class="money-amount__main">₹3,950</span>'
            "</body></html>"
        )
        fetch_browser.return_value = SimpleNamespace(status=200, css=page.css)

        product = scrape_product(
            "https://www.zara.com/in/en/regular-fit-shirt-p04493144.html?v1=495669731"
        )

        self.assertEqual(product.product_name, "REGULAR FIT SHIRT")
        self.assertEqual(product.product_price, 3950)
        self.assertEqual(product.product_image_url, "https://static.zara.net/shirt.jpg")
        fetch_json.assert_not_called()
        fetch_http.assert_not_called()
        fetch_browser.assert_called_once()
        self.assertTrue(fetch_browser.call_args.kwargs["disable_resources"])
        self.assertEqual(fetch_browser.call_args.kwargs["wait_ms"], 0)
        self.assertIn("product-detail-info__header-name", fetch_browser.call_args.kwargs["wait_selector"])
        self.assertIn("money-amount__main", fetch_browser.call_args.kwargs["wait_selector"])
        self.assertIn("og:image", fetch_browser.call_args.kwargs["wait_selector"])

    @patch("scrapers.scrape_product.fetch_json", return_value=None)
    @patch("scrapers.scrape_product.fetch_http")
    @patch("scrapers.scrape_product.fetch_browser")
    def test_uniqlo_uses_focused_real_chrome_without_waiting_for_full_page_load(
        self, fetch_browser, fetch_http, _fetch_json
    ):
        page = Selector(
            '''<script type="application/ld+json">{
              "@type": "Product",
              "name": "AIRism Cotton T-Shirt – DARK BROWN / L",
              "image": "https://image.uniqlo.com/item.jpg",
              "offers": {"price": "990", "priceCurrency": "INR"}
            }</script>'''
        )
        fetch_http.return_value = SimpleNamespace(status=500)
        fetch_browser.return_value = SimpleNamespace(status=200, css=page.css)

        product = scrape_product(
            "https://www.uniqlo.com/in/en/products/E480054-000/00?colorDisplayCode=39"
        )

        self.assertEqual(product.product_price, 990)
        fetch_browser.assert_called_once()
        self.assertTrue(fetch_browser.call_args.kwargs["real_chrome"])
        self.assertFalse(fetch_browser.call_args.kwargs["google_search"])
        self.assertTrue(fetch_browser.call_args.kwargs["disable_resources"])
        self.assertEqual(fetch_browser.call_args.kwargs["wait_ms"], 3000)
        self.assertEqual(fetch_browser.call_args.kwargs["timeout_ms"], 15000)

    @patch("scrapers.scrape_product.product_from_normal_browser_page")
    def test_hm_uses_the_normal_chrome_context_from_direct_app_urls(self, browser_page):
        browser_page.return_value = Product(
            "Oversized Fit Cotton T-shirt - White",
            1499,
            "https://image.hm.com/t-shirt.jpg",
        )

        product = scrape_product(
            "https://www2.hm.com/en_in/productpage.1331624001.html"
        )

        self.assertEqual(product.product_price, 1499)
        browser_page.assert_called_once_with(
            "https://www2.hm.com/en_in/productpage.1331624001.html", "hm"
        )

    @patch("scrapers.scrape_product.fetch_normal_chrome")
    def test_hm_primes_akamai_in_the_same_chrome_session(self, fetch_chrome):
        page = Selector(
            '''<script type="application/ld+json">{
              "@type": "Product",
              "name": "Oversized Fit Cotton T-shirt - White",
              "image": "https://image.hm.com/t-shirt.jpg",
              "offers": {"price": 1499}
            }</script>'''
        )
        fetch_chrome.return_value = SimpleNamespace(status=200, css=page.css)
        url = "https://www2.hm.com/en_in/productpage.1331624001.html"

        product = product_from_normal_browser_page(url, "hm")

        self.assertEqual(product.product_price, 1499)
        fetch_chrome.assert_called_once_with(
            url, prime_url="https://www2.hm.com/en_in/index.html"
        )

    @patch("scrapers.scrape_product.product_from_adidas_page")
    @patch("scrapers.scrape_product.product_from_adidas", side_effect=ScrapeError("HTTP 403"))
    def test_adidas_falls_back_to_embedded_page_json(self, _api, product_page):
        product_page.return_value = Product(
            "Samba OG Shoes",
            10999,
            "https://assets.adidas.com/samba.jpg",
        )

        product = scrape_product(
            "https://www.adidas.co.in/samba-og-shoes/B75806.html"
        )

        self.assertEqual(product.product_name, "Samba OG Shoes")
        product_page.assert_called_once_with(
            "https://www.adidas.co.in/samba-og-shoes/B75806.html"
        )

    @patch("scrapers.scrape_product.fetch_browser")
    def test_adidas_mobile_page_reads_next_json_without_a_product_api(self, fetch_browser):
        payload = {
            "props": {
                "pageProps": {
                    "dehydratedState": {
                        "queries": [
                            {
                                "state": {
                                    "data": {
                                        "id": "B75806",
                                        "name": "Samba OG Shoes",
                                        "pricing_information": {"currentPrice": 10999},
                                        "view_list": [
                                            {
                                                "image_url": "https://assets.adidas.com/samba.jpg"
                                            }
                                        ],
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        }
        page = Selector(
            f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'
        )
        fetch_browser.return_value = SimpleNamespace(status=200, css=page.css)

        product = product_from_adidas_page(
            "https://www.adidas.co.in/samba-og-shoes/B75806.html"
        )

        self.assertEqual(product.product_name, "Samba OG Shoes")
        self.assertEqual(product.product_price, 10999)
        self.assertTrue(fetch_browser.call_args.kwargs["real_chrome"])
        self.assertIn("Android 15", fetch_browser.call_args.kwargs["useragent"])

    @patch("scrapers.scrape_product.product_from_normal_browser_page")
    @patch(
        "scrapers.scrape_product.product_from_adidas_page",
        side_effect=ScrapeError("HTTP 403"),
    )
    @patch(
        "scrapers.scrape_product.product_from_adidas",
        side_effect=ScrapeError("HTTP 403"),
    )
    def test_adidas_uses_offscreen_normal_chrome_after_blocked_headless_paths(
        self, _api, _mobile_page, normal_page
    ):
        normal_page.return_value = Product(
            "Samba OG Shoes",
            10999,
            "https://assets.adidas.com/samba.jpg",
        )
        url = "https://www.adidas.co.in/samba-og-shoes/B75806.html"

        product = scrape_product(url)

        self.assertEqual(product.product_price, 10999)
        normal_page.assert_called_once_with(url, "adidas")

    def test_acer_graphql_payload_prefers_discounted_final_price(self):
        payload = {
            "data": {
                "route": {
                    "name": "Acer Aspire C27",
                    "small_image": {"url": "https://static.acer.com/c27.jpg"},
                    "price_range": {
                        "minimum_price": {
                            "final_price": {"value": 99946, "currency": "INR"},
                            "regular_price": {"value": 152000, "currency": "INR"},
                        }
                    },
                }
            }
        }

        product = product_from_acer_payload(
            payload,
            "https://store.acer.com/en-in/acer-aspire-c27",
        )

        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 99946)
        self.assertEqual(product.product_image_url, "https://static.acer.com/c27.jpg")

    def test_mothercare_listing_fallback_uses_exact_card_and_sale_price(self):
        target_url = (
            "https://mothercare.in/product/mothercare-pure-water-wipes-14822579"
        )
        page = Selector(
            '''
            <main>
              <a href="/product/another-product-10">
                <img src="https://cdn.example.com/another.jpg">
                <h2>Another Product</h2><span>₹33</span>
              </a>
              <a href="/product/mothercare-pure-water-paraben-free-wipes-14822579">
                <img src="https://cdn.example.com/wipes.jpg">
                <h2>Mothercare Pure Water Wipes</h2>
                <span>₹113</span><span>₹169</span><span>33% OFF</span>
              </a>
            </main>
            ''',
            url="https://mothercare.in/products?q=14822579",
        )

        product = product_from_mothercare_listing_page(page, target_url)

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Mothercare Pure Water Wipes")
        self.assertEqual(product.product_price, 113)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/wipes.jpg")

    def test_url_validation_preserves_an_empty_query_marker(self):
        url = "https://luxe.ajio.com/product/p/410499684_0000?"
        self.assertEqual(validate_url(url), url)

    def test_extracts_product_from_json_ld_graph(self):
        payload = {
            "@context": "https://schema.org",
            "@graph": [
                {"@type": "Organization", "name": "Store"},
                {
                    "@type": "Product",
                    "name": "Test Shoe",
                    "image": ["//cdn.example.com/shoe.jpg"],
                    "offers": {"@type": "Offer", "price": "4,999.00"},
                },
            ],
        }
        page = Selector(
            f'<html><script type="application/ld+json">{json.dumps(payload)}</script></html>'
        )
        product = product_from_json_ld(page, "https://shop.example.com/product")
        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Test Shoe")
        self.assertEqual(product.product_price, 4999)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/shoe.jpg")

    def test_extracts_product_group_from_json_ld(self):
        payload = {
            "@context": "https://schema.org",
            "@type": "ProductGroup",
            "name": "Luxe Perfume",
            "image": "https://assets.example.com/perfume.jpg",
            "offers": {"@type": "Offer", "price": "7,800"},
            "hasVariant": [
                {
                    "@type": "Product",
                    "name": "Luxe Perfume 50ml",
                    "offers": {"@type": "Offer", "price": 7800},
                }
            ],
        }
        page = Selector(
            f'<html><script type="application/ld+json">{json.dumps(payload)}</script></html>'
        )

        product = product_from_json_ld(page, "https://luxe.ajio.com/product?")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Luxe Perfume")
        self.assertEqual(product.product_price, 7800)
        self.assertEqual(product.product_image_url, "https://assets.example.com/perfume.jpg")

    def test_extracts_product_from_malformed_retailer_json_ld(self):
        raw = r'''
        {
          "@type": "Product",
          "name": "Croma Test TV",
          "image": ["https://cdn.example.com/tv.jpg"],
          "description": "A raw
          multiline description",
          "offers": {"@type": "Offer", "price": "32990.00"}
        }
        '''
        product = product_from_malformed_json_ld(raw, "https://shop.example.com/tv")
        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Croma Test TV")
        self.assertEqual(product.product_price, 32990)

    def test_extracts_product_from_json_ld_with_unquoted_image_url(self):
        raw = '''
        {
          "@type": "Product",
          "name": "Lost in the City",
          "image":https://example.com/book.jpg",
          "offers": {"@type": "Offer", "price": "1,108"}
        }
        '''

        product = product_from_malformed_json_ld(raw, "https://shop.example.com/book")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Lost in the City")
        self.assertEqual(product.product_price, 1108)
        self.assertEqual(product.product_image_url, "https://example.com/book.jpg")

    def test_extracts_product_from_embedded_storefront_json(self):
        payload = {
            "pageProps": {
                "product": {
                    "productName": "New Store Sneaker",
                    "salePrice": {"value": "₹4,299"},
                    "primaryImage": {"url": "//cdn.example.com/sneaker.jpg"},
                }
            }
        }
        page = Selector(
            f'<html><script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script></html>'
        )
        product = product_from_embedded_json(page, "https://shop.example.com/products/sneaker")
        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "New Store Sneaker")
        self.assertEqual(product.product_price, 4299)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/sneaker.jpg")

    def test_floweraura_uses_product_hero_instead_of_og_logo(self):
        page = Selector(
            '<html><head>'
            '<meta property="product:price:amount" content="695">'
            '<meta property="og:image" content="https://shop.example/logo.jpg">'
            '</head><body><main><h1>Forever 12 Red Rose Bunch</h1>'
            '<img fetchpriority="high" src="https://shop.example/rose.jpg">'
            '</main></body></html>'
        )

        product = product_from_page(page, "floweraura", "https://shop.example/p/rose")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_image_url, "https://shop.example/rose.jpg")

    def test_extracts_kindlife_product_from_static_dom(self):
        page = Selector(
            '<html><head><meta name="og:image" content="https://cdn.example.com/concealer.jpg">'
            '</head><body><h1 class="ty-product-block__title">Tip Concealer</h1>'
            '<span id="sec_discounted_price_72319" class="bk-price-num">1,233</span>'
            '</body></html>'
        )

        product = product_from_page(page, "kindlife", "https://www.kindlife.in/concealer/")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Tip Concealer")
        self.assertEqual(product.product_price, 1233)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/concealer.jpg")

    def test_extracts_wildcraft_magento_graphql_product(self):
        payload = {
            "data": {
                "products": {
                    "items": [
                        {
                            "name": "Storm 3 Backpack - Blue",
                            "image": {"url": "https://cdn.example.com/storm-3.jpg"},
                            "price_range": {
                                "minimum_price": {"final_price": {"value": 2024}}
                            },
                        }
                    ]
                }
            }
        }

        product = product_from_wildcraft_payload(payload, "https://wildcraft.com/storm3")

        self.assertIsNotNone(product)
        self.assertEqual(product.product_name, "Storm 3 Backpack - Blue")
        self.assertEqual(product.product_price, 2024)
        self.assertEqual(product.product_image_url, "https://cdn.example.com/storm-3.jpg")

    def test_extracts_meesho_next_data(self):
        payload = {
            "pageProps": {
                "initialState": {
                    "product": {
                        "details": {
                            "data": {
                                "name": "Meesho Hair Oil",
                                "price": 144,
                                "images": ["//images.meesho.com/oil.jpg"],
                            }
                        }
                    }
                }
            }
        }
        product = product_from_meesho_payload(payload, "https://www.meesho.com/item/p/abc")
        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 144)
        self.assertEqual(product.product_image_url, "https://images.meesho.com/oil.jpg")

    @patch("scrapers.scrape_product.product_from_shopify")
    def test_new_store_product_paths_try_shopify_json_first(self, shopify):
        expected = Product("Gully Labs Sneaker", 8999, "https://cdn.example.com/gully.jpg")
        shopify.return_value = expected

        product = scrape_product("https://gullylabs.com/products/test-sneaker")

        self.assertEqual(product, expected)
        shopify.assert_called_once()

    def test_extracts_myntra_embedded_state(self):
        state = {
            "pdpData": {
                "name": "Perfume",
                "mrp": 6600,
                "selectedSeller": {"discountedPrice": 5999},
            }
        }
        page = Selector(
            "<html><head>"
            '<meta property="og:image" content="https://assets.example.com/item.jpg">'
            f"</head><script>window.__myx = {json.dumps(state)}</script></html>"
        )
        product = product_from_myntra_state(page, "https://www.myntra.com/1")
        self.assertIsNotNone(product)
        self.assertEqual(product.product_price, 5999)

    def test_extracts_tatacliq_embedded_state(self):
        state = {
            "productDescriptionData": {
                "productName": "Polo Shirt",
                "winningSellerPrice": {"value": 3200},
                "galleryImagesList": [
                    {"galleryImages": [{"value": "//img.example.com/polo.jpg"}]}
                ],
            }
        }
        page = Selector(
            f"<html><script>window.initialData = {json.dumps(state)};</script></html>"
        )
        product = product_from_tatacliq_state(page, "https://luxury.tatacliq.com/p-1")
        self.assertIsNotNone(product)
        self.assertEqual(product.product_image_url, "https://img.example.com/polo.jpg")

if __name__ == "__main__":
    unittest.main()
