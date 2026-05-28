require('dotenv').config();
const cheerio = require("cheerio");
const mysql = require('mysql2/promise');
const { error, log } = require('node:console');
const { basename } = require('node:path');

const config = {
    db: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME
    }
};

async function searchLeaders(params) {

    const connection = await mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.name
    });

    let [decks] = await connection.execute(
        'SELECT deckListText FROM alldecklinks WHERE 1'
    );

    const uniqueLeaders = new Set();
    for (const d of decks) {
        if (d.deckListText !== "NOT VALID") {
            try {
                let leaderTitle = d.deckListText.split("Leader\n1 ")[1].split("\n")[0];
                uniqueLeaders.add(leaderTitle);
            } catch { }
        }
    }
    //console.log(decks.length)
    for (const leaderTitle of uniqueLeaders) {

        try {
            let [leaderName, leaderSubtitle] = leaderTitle.split(" | ");

            let url = `${process.env.API_CARDS}q=name:"${leaderName}"`;
            const res = await fetch(url);
            let json = await res.text();
            let data = JSON.parse(json).data;

            let leaderCard = data.find(card =>
                card.Subtitle.toLowerCase() === leaderSubtitle.toLowerCase() && card.Type === "Leader"
            );
            if (!leaderCard) {
                console.log("Not found:", leaderTitle);
                continue;
            }
            leaderName = leaderCard.Name
            leaderSubtitle = leaderCard.Subtitle

            let leaderSet = leaderCard.Set
            let leaderAspects = leaderCard.Aspects.join("-")
            let leaderFrontArt = leaderCard.FrontArt
            let apiNumber = leaderCard.Number
            let leaderMelee = leaderTitle
            let leaderId = leaderSet + apiNumber

            //console.log(data)
            await connection.execute(
                `INSERT IGNORE INTO leaderdata (leaderId,leaderSet, leaderName, leaderSubtitle, leaderAspects, leaderFrontArt, apiNumber, leaderMelee) VALUES (?,?,?,?,?,?,?,?)`,
                [leaderId, leaderSet, leaderName, leaderSubtitle, leaderAspects, leaderFrontArt, apiNumber, leaderMelee]
            );
        }
        catch (err) {
            console.log("Error with:", leaderTitle);
        }

    }
    await connection.end()
}


async function searchBases(params) {

    const connection = await mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.name
    });

    let [decks] = await connection.execute(
        'SELECT deckListText FROM alldecklinks WHERE 1'
    );

    const uniquebaseNames = new Set();
    decks.forEach((deck) => {
        if (deck.deckListText != "NOT VALID") {
            try {
                let baseName = deck.deckListText.split("Base\n1 ")[1].split("\n")[0];
                uniquebaseNames.add(baseName)
            } catch { }
        }
    })
    if (uniquebaseNames.size > 1) {
        for (const baseNamet of uniquebaseNames) {

            try {
                let url = `${process.env.API_CARDS}q=name:"${baseNamet}"`;
                const res = await fetch(url);
                let json = await res.text();
                let data = JSON.parse(json).data;

                let baseCard = data.find(card =>
                    card.Name.toLowerCase() === baseNamet.toLowerCase() && card.Type === "Base"
                );
                //console.log(baseCard)
                if (!baseCard) {
                    console.log("Not found:", baseNamet);
                    continue;
                }

                let baseName = baseCard.Name
                let baseSet = baseCard.Set
                let baseAspects = baseCard.Aspects.join("-")
                let baseFrontArt = baseCard.FrontArt
                let baseNumber = baseCard.Number
                let baseId = baseSet + baseNumber
                let baseSpecial = 0
                let baseAltName = baseAspects

                if ((baseCard?.FrontText ?? "") !== "" || baseCard?.HP !== "30") {
                    baseSpecial = 1;
                }


                if (baseSpecial == 1) {
                    switch (true) {
                        case /(create your Force token)/i.test(baseCard.FrontText):
                            baseAltName = baseAspects + " (Force)"
                            break
                        case /ignoring 1 of its/i.test(baseCard.FrontText):
                            baseAltName = baseAspects + " (Multiaspect)"
                            break
                        default:
                            baseAltName = baseName
                            break
                    }
                }


                //console.log(data)
                await connection.execute(
                    `INSERT IGNORE INTO basedata (baseId,baseName,baseAspects,baseFrontArt,baseSet,baseNumber,baseSpecial,baseAltName) VALUES (?,?,?,?,?,?,?,?)`,
                    [baseId, baseName, baseAspects, baseFrontArt, baseSet, baseNumber, baseSpecial, baseAltName]
                );
            }
            catch (err) {
                console.log("Error with:", err, baseNamet);
            }
        };
    }
    await connection.end()
}




//searchLeaders()
searchBases()