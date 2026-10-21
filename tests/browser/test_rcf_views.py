"""Rõuge CrossFiti päris Chromiumi vaadetestid eraldatud andmetega.

Käivitamiseks: python -m unittest discover -s tests/browser -p 'test_*.py' -v
Nõuab: pip install playwright==1.56.0 && python -m playwright install chromium
Veebiserver peab serveerima repo /Crossfit/ teekonnas pordil 4173.
"""
import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ORIGIN = "http://127.0.0.1:4173"
APP_URL = ORIGIN + "/Crossfit/"
BACKEND = "https://aanxpugvehwtcwwpefwx.supabase.co"
TRAINER = "11111111-1111-4111-8111-111111111111"
CLIENT = "22222222-2222-4222-8222-222222222222"
SCREENSHOTS = Path("test-results/screenshots")


class RCFBrowserSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        SCREENSHOTS.mkdir(parents=True, exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = None
        self.page = None

    def tearDown(self):
        if self.context:
            self.context.close()

    def open_app(self, role="client", width=390, height=844):
        uid = TRAINER if role == "trainer" else CLIENT
        profile = {"user_id": uid, "display_name": "Testtreener" if role == "trainer" else "Testklient",
                   "role": role, "avatar_path": None}
        other = {"user_id": CLIENT, "display_name": "Testklient",
                 "role": "client", "avatar_path": None}
        profiles = [profile, other] if role == "trainer" else [profile]
        upcoming = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        trainings = [{
            "id": 201, "title": "Testtreening", "starts_at": upcoming,
            "status": "published", "archived_at": None, "capacity": 10,
            "duration_minutes": 60, "cancellation_hours": 6,
            "created_by": TRAINER, "workout_text": "Soojendus 10 min"
        }]
        registrations = [{"id": 1, "training_id": 201, "user_id": CLIENT,
                          "status": "confirmed", "credit_charged": True,
                          "created_at": datetime.now(timezone.utc).isoformat(),
                          "payment_status": "unpaid"}]
        session = {"access_token": "TEST_TOKEN_NO_NETWORK",
                   "refresh_token": "TEST_REFRESH_NO_NETWORK",
                   "user": {"id": uid, "email": "test@example.invalid",
                            "user_metadata": {"display_name": profile["display_name"]}}}
        def handler(route):
            request = route.request
            url = urlparse(request.url)
            if url.netloc == urlparse(BACKEND).netloc:
                if url.path == "/auth/v1/token":
                    payload = session
                elif url.path == "/auth/v1/user":
                    payload = session["user"]
                elif url.path.startswith("/rest/v1/"):
                    name = url.path.split("/")[-1]
                    query = parse_qs(url.query)
                    if name == "wod_profiles":
                        payload = [profile] if "user_id" in query else profiles
                    elif name == "wod_trainings":
                        payload = trainings
                    elif name == "wod_registrations":
                        payload = registrations
                    elif name == "wod_wallets":
                        payload = [{"user_id": CLIENT, "credits": 3}]
                    elif name == "wod_bank_entries":
                        payload = []
                    else:
                        payload = []
                else:
                    payload = []
                route.fulfill(status=200, content_type="application/json",
                              body=json.dumps(payload))
            elif url.netloc == urlparse(ORIGIN).netloc:
                route.continue_()
            else:
                # Browser can't contact real backends or third-party services.
                route.abort()
        self.context = self.browser.new_context(
            viewport={"width": width, "height": height},
            device_scale_factor=1,
            is_mobile=width < 600,
            has_touch=width < 600,
            service_workers="block",
        )
        self.context.route("**/*", handler)
        self.context.add_init_script(
            "localStorage.setItem('wod_session', JSON.stringify(" + json.dumps(session) + "))"
        )
        self.page = self.context.new_page()
        self.page.goto(APP_URL, wait_until="domcontentloaded")
        self.page.locator(".app-shell").wait_for(state="visible", timeout=20000)
        self.page.locator(".bottom-nav").wait_for(state="visible")
        return self.page

    def verify_fit(self):
        measurements = self.page.evaluate("""() => ({
            viewport: window.innerWidth,
            root: document.documentElement.scrollWidth,
            shell: document.querySelector('.app-shell').getBoundingClientRect().width
        })""")
        self.assertLessEqual(
            measurements["root"], measurements["viewport"] + 2,
            "Horisontaalne kerimine: " + str(measurements)
        )

    def snapshot(self, name):
        self.page.screenshot(path=str(SCREENSHOTS / (name + ".png")),
                             full_page=True, animations="disabled")

    def test_mobile_client_navigation_and_no_horizontal_scroll(self):
        page = self.open_app("client", 390, 844)
        self.assertIn("Testklient", page.locator("body").inner_text())
        self.verify_fit()
        self.snapshot("client-home-mobile")
        page.locator(".bottom-nav").get_by_role("button", name="Treeningud").click()
        page.locator(".tl-page").wait_for(state="visible")
        self.verify_fit()
        self.snapshot("client-training-mobile")
        page.locator(".bottom-nav").get_by_role("button", name="Minu").click()
        self.verify_fit()
        self.snapshot("client-account-mobile")

    def test_trainer_navigation_on_desktop_and_card_readability(self):
        page = self.open_app("trainer", 1280, 800)
        self.verify_fit()
        self.snapshot("trainer-home-desktop")
        page.locator(".bottom-nav").get_by_role("button", name="Treeningud").click()
        page.locator(".tl-training-card").first.wait_for(state="visible")
        self.verify_fit()
        self.snapshot("trainer-trainings-desktop")
        page.locator(".bottom-nav").get_by_role("button", name="Kliendid").click()
        page.locator(".cl-card").first.wait_for(state="visible")
        self.verify_fit()
        page.get_by_role("button", name="Kliendikaart").first.click()
        stats = page.locator(".cl-detail-stats > div").first
        stats.wait_for(state="visible")
        colors = stats.evaluate("""e => ({
            bg: getComputedStyle(e).backgroundColor,
            text: getComputedStyle(e).color
        })""")
        self.assertEqual(colors["bg"], "rgb(255, 255, 255)")
        self.assertEqual(colors["text"], "rgb(16, 27, 19)")
        self.snapshot("trainer-client-card-desktop")

    def test_small_phone_and_notifications(self):
        page = self.open_app("client", 360, 740)
        self.verify_fit()
        page.get_by_role("button", name="Teavitused").first.click()
        page.locator(".nc-page").wait_for(state="visible")
        self.verify_fit()
        self.snapshot("client-notifications-small-mobile")


    def assert_contrast(self, surface_selector, text_selector, minimum=4.5):
        ratio = self.page.evaluate("""({ surface, text }) => {
          function luminance(color) {
            const values = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
            if (!values || values.length !== 3) throw new Error('Unsupported color: ' + color);
            const [r, g, b] = values.map(value => {
              const c = value / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return r * .2126 + g * .7152 + b * .0722;
          }
          const surfaceColor = getComputedStyle(document.querySelector(surface)).backgroundColor;
          const textColor = getComputedStyle(document.querySelector(text)).color;
          const a = luminance(surfaceColor), b = luminance(textColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        }""", {"surface": surface_selector, "text": text_selector})
        self.assertGreaterEqual(
            ratio, minimum,
            f"Teksti kontrast {ratio:.2f} (nõutav {minimum}): {surface_selector} / {text_selector}"
        )

    def test_client_account_and_install_banner_text_readability(self):
        page = self.open_app("client", 390, 844)
        self.assert_contrast(".install-promo", ".install-promo-copy strong")
        self.assert_contrast(".install-promo", ".install-promo-copy span")
        page.locator(".bottom-nav").get_by_role("button", name="Minu").click()
        page.locator(".my-profile-card").wait_for(state="visible")
        self.assert_contrast(".my-profile-card", ".my-profile-identity h1")
        self.assert_contrast(".my-profile-card", ".my-profile-identity p")
        self.assert_contrast(".my-profile-card", ".my-profile-edit")
        self.assert_contrast(".my-booking-row", ".my-booking-main > strong")
        self.snapshot("client-account-contrast-mobile")


if __name__ == "__main__":
    unittest.main()
