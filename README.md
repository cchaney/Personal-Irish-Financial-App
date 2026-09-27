# PIFA — Personal Irish Financial App

A private money tracker for people in Ireland. See where your money goes, track your net worth, investments, pensions and debts, and simulate your retirement using Irish tax rules.

It runs on your own computer. Your data never leaves it.

> PIFA is not financial advice. See [DISCLAIMER.md](DISCLAIMER.md).

## Install

**1. Install Docker Desktop**

Download it from [docker.com](https://www.docker.com/products/docker-desktop/), install it, and open it. Leave it running.

**2. Download PIFA**

Click the green **Code** button at the top of this page → **Download ZIP**. Unzip it somewhere easy, like your Desktop. You'll get a folder called `pifa-main` (the "PIFA folder" below).

**3. Start PIFA**

Open a terminal in the PIFA folder (Windows: right-click inside the folder → **Open in Terminal**; Mac: open Terminal, type `cd `, drag the folder in, press Enter) and run:

```
docker compose up -d --build
```

The first time takes a few minutes.

**4. Open it**

Go to **http://localhost:8080** in your browser.

## First steps

- **Just looking?** Go to **Settings → Load demo data**.
- **Using your own money:**
  1. **Settings** → enter your date of birth and salary.
  2. **Accounts** → add your bank accounts, savings, pensions and loans.
  3. **Transactions → Import CSV** → upload a CSV export from your bank (AIB, Bank of Ireland, PTSB, Revolut, N26 and most others work).

Want to test an import first? Use [`samples/sample-transactions.csv`](samples/sample-transactions.csv).

## Stop, start and update

```
docker compose stop                    # stop
docker compose start                   # start again
docker compose up -d --build           # after downloading a new version
```

Your data is kept between restarts and updates. Back it up with **Settings → Export backup**.

## Optional: AI coach

To use a free AI that runs on your own computer (needs about 8 GB of free memory):

```
docker compose --profile ai up -d --build
docker compose exec ollama ollama pull llama3.1:8b
```

Then in PIFA go to **Settings → AI coach**, choose **Ollama**, and click **Save and test connection**.

## Problems?

| Problem | Fix |
|---|---|
| `no configuration file provided` | You're in the wrong folder. `cd` into the folder that contains `docker-compose.yml`. |
| `cd: too many arguments` | The folder name has a space. Use quotes: `cd "My Folder"` |
| `port is already allocated` | Copy `.env.example` to a new file called `.env`, change `PIFA_PORT=8080` to `PIFA_PORT=8090`, run step 3 again and use that port. |
| Docker errors on start | Make sure Docker Desktop is open and running. |

## Optional settings

PIFA works without any configuration. To change the port, block all internet access, or use Claude as the AI coach, copy `.env.example` to a new file called `.env`, edit it, and run `docker compose up -d` again. Each setting is explained inside the file.

More detail (AI options, offline mode, backups, development) is in the [full guide](docs/GUIDE.md).

## Contributing

Pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Licence

[MIT](LICENSE). Free to use and change, with no warranty.
