require('dotenv').config();
const cheerio = require("cheerio");
const mysql = require('mysql2/promise');
const { error, log } = require('node:console');

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

    for (let i = 0; i < decks.length; i++) {

        const decklist = decks[i].deckListText;


        if (decklist != "NOT VALID") {
            console.log(decklist)
            break
            leaderTitle = decklist.split("Leader\n1 ")[1].split("\n")[0]
            let [leaderName, leaderSubtitle] = leaderTitle.split(" | ")

            //console.log(leaderName, leaderSubtitle)
            try {
                let url = `${process.env.API_CARDS}q=name:"${leaderName}"`
                const res = await fetch(url);
                let json = await res.text()
                data = JSON.parse(json).data

                leaderCard = data.filter((card) => {
                    return card.Subtitle == leaderSubtitle
                })[0]
                let leaderSet = leaderCard.Number
                let leaderName = leaderCard.Name
                let leaderSubtitle = leaderCard.Subtitle
                let leaderAspects = leaderCard.Aspects.join("-")
                let leaderFrontArt = leaderCard.FrontArt
                let apiNumber = leaderCard.Number
                let leaderMelee = leaderTitle

                console.log(data)
                // await connection.execute(
                //     `INSERT IGNORE INTO leaderdata (leaderSet, leaderName, leaderSubtitle, leaderAspects, leaderFrontArt, apiNumber, leaderMelee) VALUES (?,?,?,?,?,?,?)`,
                //     [leaderSet, leaderName, leaderSubtitle, leaderAspects, leaderFrontArt, apiNumber, leaderMelee]
                // );
            }
            catch (err) {
                console.error(err)
            }

        }
    }

}

searchLeaders()