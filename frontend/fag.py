import requests
from bs4 import BeautifulSoup


def decode_secret_message(url):
    response = requests.get(url)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    points = []
    max_x = 0
    max_y = 0

    # Read every table row in the published Google Doc
    for row in soup.find_all("tr"):
        cells = [cell.get_text(strip=True) for cell in row.find_all(["td", "th"])]

        if len(cells) < 3:
            continue

        # Skip the header row or any row that does not contain coordinates
        try:
            x = int(cells[0])
            char = cells[1]
            y = int(cells[2])
        except ValueError:
            continue

        points.append((x, y, char))

        max_x = max(max_x, x)
        max_y = max(max_y, y)

    # Create an empty grid filled with spaces
    grid = [
        [" " for _ in range(max_x + 1)]
        for _ in range(max_y + 1)
    ]

    # Place each Unicode character at its specified coordinate
    for x, y, char in points:
        grid[y][x] = char

    # y = 0 is at the bottom, so print from the largest y down to 0
    for y in range(max_y, -1, -1):
        print("".join(grid[y]))


# Example:
# decode_secret_message("https://docs.google.com/document/d/e/2PACX-1vSvM5gDlNvt7npYHhp_XfsJvuntUhq184By5xO_pA4b_gCWeXb6dM6ZxwN8rE6S4ghUsCj2VKR21oEP/pub")