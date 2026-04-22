require('dotenv').config();
const cheerio = require("cheerio");
const mysql = require('mysql2/promise');


const RESOURCE = process.env.FETCH_RESOURCE
const TABLEID = "#" + process.env.HTML_ID
const DECKID = "#" + process.env.DECK_ID
const DATEINDX = 0
const STANDINGINDX = 1
const DECKNAMEINDX = 3
const EVENTTYPEINDX = 4
const EVENTINDX = 7

let SEARCHING = true
let COLLECTING = true

const config = {
    db: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME
    }
};

async function scrapeRecentEvents(connection) {
    try {
        const res = await fetch(RESOURCE);
        const html = await res.text();
        const chrupek = cheerio.load(html);
        let rows = chrupek(TABLEID + " tr")

        if (rows) {
            for (let i = 0; i < rows.length; i++) {

                let row = rows[i]
                let deckNameCell = chrupek(row).find("td").eq(DECKNAMEINDX)
                let deckNameA = deckNameCell.find("a")

                let deckName = deckNameA.text().trim()
                let deckLink = deckNameA.attr("href")
                const target = process.env.SCRAPE_TARGET;

                if (typeof deckLink === "string" && deckLink.startsWith(target)) {
                    deckLink = deckLink.slice(target.length);
                } else {
                    deckLink = "";
                }

                let eventTypeCell = chrupek(row).find("td").eq(EVENTTYPEINDX)
                let eventType = eventTypeCell.text().trim()
                let eventFormat = "Premier"

                //to.do() erm wiecej formatów
                switch (true) {
                    case /Eternal/i.test(eventType):
                        eventFormat = "Eternal"
                        break
                    default:
                        break
                }

                let eventLinkCell = chrupek(row).find("td").eq(EVENTINDX)
                let eventLinkA = eventLinkCell.find("a")
                let eventLink = eventLinkA.attr("href")

                let eventStandingCell = chrupek(row).find("td").eq(STANDINGINDX)
                let eventStanding = parseInt(eventStandingCell.text().trim())

                let eventDateCell = chrupek(row).find("td").eq(DATEINDX)
                let eventDate = eventDateCell.text().trim()
                //console.log([deckName, deckLink, eventType, eventLink, eventStanding, eventFormat, eventDate])

                if (deckLink && deckLink.trim() !== '') {
                    await connection.execute(
                        'INSERT IGNORE INTO eventdecks (deckName, deckLink, eventType, eventLink, eventStanding, eventFormat, eventDate) VALUES (?,?,?,?,?,?,?)',
                        [deckName, deckLink, eventType, eventLink, eventStanding, eventFormat, eventDate]
                    );
                    await connection.execute(
                        'INSERT IGNORE INTO alldecklinks (deckLink,isChecked) VALUES (?,0)',
                        [deckLink]
                    );
                }
            };

        } else {
            console.log('Strona nie dziala');
        }

    }
    catch (err) {
        console.log(err)
    }


}



async function Search(connection) {
    let [links] = await connection.execute(
        'SELECT deckLink FROM alldecklinks WHERE isChecked = 0 LIMIT 50'
    );

    if (links.length == 0) { SEARCHING = false }

    let checkedList = []

    //// Znajdywanie powiązanych linków
    for (let i = 0; i < links.length; i++) {
        const link = links[i].deckLink;
        try {
            let target = process.env.SEARCH_TARGET + link;

            let res = await fetch(target, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": process.env.SEARCH_REFER,
                    "Origin": process.env.SEARCH_ORIGIN,
                }
            });

            let data = await res.json();
            data = JSON.parse(data.Json)

            checkedList.push(link)

            if (data.Matches) {
                let guids = data.Matches
                    .map(m => m.OpponentDecklistGuid)
                    .filter(Boolean);

                if (guids.length > 0) {
                    let placeholders = guids.map(() => '(?, 0)').join(', ');
                    let values = guids.flatMap(g => [g]);
                    await connection.execute(
                        `INSERT IGNORE INTO alldecklinks (deckLink, isChecked) VALUES ${placeholders}`,
                        values
                    );
                }
            }
        } catch (err) {
            console.log(err);
        }
    }

    //Status sprawdzonego na sprawdzone
    if (checkedList.length > 0) {
        const placeholders = checkedList.map(() => '?').join(',');
        await connection.execute(
            `UPDATE alldecklinks SET isChecked = 1 WHERE deckLink IN (${placeholders})`,
            checkedList
        );
    }

}

async function CollectDeckData(connection) {
    let [links] = await connection.execute(
        `SELECT deckLink FROM alldecklinks WHERE isChecked = 1 AND (eventJson IS NULL OR deckListText IS NULL) LIMIT 50`
    );
    if (links.length < 5) { COLLECTING = false }

    //// Umieszczenie jsona w bazie
    for (let i = 0; i < links.length; i++) {
        const link = links[i].deckLink;
        try {
            let target = process.env.SEARCH_TARGET + link;

            let res = await fetch(target, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": process.env.SEARCH_REFER,
                    "Origin": process.env.SEARCH_ORIGIN,
                }
            });

            let data = await res.json();

            try {
                data = JSON.parse(data.Json)
            } catch (err) {
                data = null
            }
            //console.log(data ? JSON.stringify(data) : null)
            await connection.execute(
                `UPDATE alldecklinks SET eventJson = ? WHERE deckLink = ?`,
                [data ? JSON.stringify(data) : null, link]
            )


        } catch (err) {
            console.log(err);
        }

        try {
            let res = await fetch(process.env.SCRAPE_TARGET + link, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": process.env.SEARCH_REFER,
                    "Origin": process.env.SEARCH_ORIGIN,
                }
            });
            const html = await res.text();
            const chrupek = await cheerio.load(html);

            let deckString = await chrupek(DECKID).text().trim()
            console.log(deckString)

            await connection.execute(
                `UPDATE alldecklinks SET deckListText = ? WHERE deckLink = ?`,
                [deckString ? deckString : "NOT VALID", link]
            );


        } catch (error) {
            console.log(error)
        }

    }

}

async function updateDeckData() {

    const connection = await mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.name
    });


    try {
        await scrapeRecentEvents(connection)

    } catch (err) {
        console.error(err);
    }

    while (SEARCHING) {
        try {
            console.log("searching....")
            await Search(connection);

        } catch (err) {
            console.error(err);
        }

    }

    while (COLLECTING) {
        try {
            console.log("collecting....")
            await CollectDeckData(connection);

        } catch (err) {
            console.error(err);
        }
    }

    await connection.end();
}

updateDeckData()
