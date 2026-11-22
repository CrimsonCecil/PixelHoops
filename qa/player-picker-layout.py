#!/usr/bin/env python3
"""Check the player picker's scroll direction against a local game server."""
import os

from playwright.sync_api import sync_playwright


MEASURE = """grid => {
    const body = grid.parentElement;
    return {
        grid: [grid.clientWidth, grid.scrollWidth],
        body: [body.clientWidth, body.scrollWidth],
        vertical: grid.scrollHeight > grid.clientHeight || body.scrollHeight > body.clientHeight
    };
}"""
SCROLLED = "() => document.querySelector('#pk-grid').scrollTop + document.querySelector('.pk-body').scrollTop > 0"


def main():
    url = os.environ.get('PIXELHOOPS_URL', 'http://127.0.0.1:8080/index.html')
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH'))
        for width, height, mobile in [(1280, 800, False), (844, 390, True), (375, 667, True)]:
            page = browser.new_page(viewport={'width': width, 'height': height},
                                    is_mobile=mobile, has_touch=mobile)
            page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(url.rsplit('/', 1)[0] + '/') else r.abort())
            page.goto(url)
            page.wait_for_function("!!window.advanceTime")
            page.get_by_test_id('home-solo').click()
            page.get_by_test_id('solo-1v1').click()
            page.locator('#pick0').click()
            page.locator('#front-player-detail').click()
            page.get_by_test_id('pkt-all').click()
            page.locator('[data-pos="SF"]').click()
            grid = page.locator('#pk-grid')
            for roster in ('1V1 forwards', '1V1 full roster', '3V3 full roster'):
                result = grid.evaluate(MEASURE)
                assert result['grid'][0] == result['grid'][1], (width, height, roster, result)
                assert result['body'][0] == result['body'][1], (width, height, roster, result)
                assert result['vertical'], (width, height, roster, result)
                print(f'PASS {width}x{height} {roster}: vertical scroll only')
                if roster == '1V1 forwards':
                    page.locator('[data-pos="SF"]').click()
                elif roster == '1V1 full roster':
                    page.locator('#pk-cancel').click()
                    page.locator('#front-back').click()
                    page.get_by_test_id('solo-t3').click()
                    page.locator('#pick3-0').click()
                    page.locator('#front-player-detail').click()
            grid.evaluate("""grid => {
                grid.querySelector('.pf')?.classList.remove('pf');
                grid.querySelector('.pkc').classList.add('pf');
                grid.scrollTop = grid.parentElement.scrollTop = 0;
            }""")
            for _ in range(20):
                focused = grid.locator('.pkc.pf')
                player = focused.get_attribute('data-pk')
                page.keyboard.press('ArrowDown')
                page.wait_for_function(
                    "player => document.querySelector('#picker .pf')?.dataset.pk !== player",
                    arg=player)
                assert focused.count() == 1, (width, height, 'focus left the roster')
                if page.evaluate(SCROLLED):
                    break
            else:
                raise AssertionError((width, height, 'navigation did not scroll the roster'))
            print(f'PASS {width}x{height} ArrowDown keeps focus in the roster and scrolls it')
            page.close()
        browser.close()


if __name__ == '__main__':
    main()
