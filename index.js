const { mwn } = require('mwn'); 
const config = require('./config.json');
const updateData = require('./updateData.json');

const BOTUSERNAME = config.bot_username;
const BOTPASSWORD = config.bot_password;
const USERAGENT = config.user_agent; //https://meta.wikimedia.org/wiki/User-Agent_policy

/*
*   This function purges cache of a given page, allowing it to be "refreshed"
*   Quite important to call it after changing contents of the main page
*/
async function purgePage(bot, title){
    await bot.request({
        action: 'purge',
        titles: title
    });
}

/**
*   Function that gets the API response and searches for a category that the particular article should be associated with.
*   @param wikitext The page contents as a wikitext
*/
async function getPortal(wikitext){
    const pattern = /{{(Gospodarka|Katastrofy|Kultura|Nauka|Polityka|Prawo i przestępczość|Sport|Społeczeństwo|Technika)/i; 
    let portal = wikitext.match(pattern);
    if(portal == null){
        return "";
    }
    else{
        let portalName = portal[1];
        portalName = portalName[0].toUpperCase() + portalName.substring(1);
        return portalName;
    }
}

/**
*   Gets the API response, looks for the date of article's creation
*   @param wikitext The page contents as a wikitext
*/
async function getDate(wikitext){
    const pattern = /{{data\|(.*?)}}/i;  //Loking for a particular template that contains info we need
    let date = wikitext.match(pattern);
    if(date == null){
        return "";
    }
    else{
        return date[1];
    }
}

/**
*   Gets the API response, checks if there is an image in the text. 
*   If there is, it should return its name (or blank string if there was no image found).
*   @param wikitext The page contents as a wikitext
*/
async function getImage(wikitext){
    //Yes, those regexes are scary, but @Msz2001 made sure they do indeed work!
    let pattern = /\|([^|=\[\]\n]*\.(JPG|PNG|JPEG|WEBP|GIF|TIF|TIFF|BMP|SVG))/i;
    let image = wikitext.match(pattern);
    if(image == null){
        pattern = /\[\[Plik:(.*\.(JPG|PNG|JPEG|WEBP|GIF|TIF|TIFF|BMP|SVG))/i; 
        image = wikitext.match(pattern);

        if(image == null){
            return "";
        }
        else{
            return image[1];
        }
    }
    else{
        return image[1];
    }
}

/**
*   Gets the response from the API and returns the article lead.
*   The lead should be written in bold to be recognized
*   @param wikitext The page contents as a wikitext
*/
async function getLead(wikitext){
    const pattern = /'''(.*?)'''/; //Looking for text in bold (as specified earlier)
    
    let lead = wikitext.match(pattern);
    if(lead===null){
        return "";
    }
    else{
        return lead[1];
    }
}

/**
*   Checks the newest articles that are provided via the dynamic page list.
*   It's not the cleanest implementation, but it works sufficiently.
*   Please note that said list excludes articles with {{tworzone}} template.
*   @param bot The object obtained from mwn.init
*   @param article_count Number of articles to load
*/
async function getTop(bot, dpl_location){

    await purgePage(dpl_location);
    let pageContent = await bot.parseTitle(dpl_location); //We need to parse the contents of the page before using regex on it 

    const regex = /title=\"(.*?)\">/g;
    let arrayOfMatches = pageContent.matchAll(regex);
    let titles = [];

    // Extract the first capture group from every match
    for(let match of arrayOfMatches){
        titles.push(match[1]);
    }

    return titles;
}

/*
*   "where" is a subpage of the main page where we should put the sneak peek of a given article
*   "what" is a title of said article
*/

async function generateSneakPeek(bot, where, what){
    let ans = await bot.read(what); //Answer from the API
    let wikitext = ans.revisions[0].content;

    //We create a string matching specifications for a sneak peek of an article. 
    //Those specifications were provided by Msz2001.
    let content =
        `{{Strona główna/Wycinek artykułu
        |tytuł=${what}
        |data=${await getDate(wikitext)}
        |treść=${await getLead(wikitext)}
        |obrazek=${await getImage(wikitext)}
        |portal=${await getPortal(wikitext)}
        |duży={{{duży|}}}
        }}`;
        
    await bot.save(where, content, "Bot zmienia artykuł do ekspozycji");
}

/*
*   Function tasked with updating the given page, called by the main() every 20 minutes
*/
async function updatePage(bot, pagename, template_location, dpl_location){

    let recentTitles = await getTop(bot, ARTICLE_COUNT, dpl_location);

    const prefix = `${template_location} `; //after adding a number it should look like this: Szablon:Strona główna/Artykuł 1 

    // Apply changes to all the appropriate subpages
    for(let i=0;i<recentTitles.length;i++){
        let pageToChange = prefix + (i+1); 
        await generateSneakPeek(bot, pageToChange, recentTitles[i]);
    }
    await purgePage(bot, pagename); //Purging the main page to make sure that changes we've made can be seen by everybody 
}

/**
 * It goes through all pages listed in the updateData.json and calls updatePage() accordingly
 */
async function updateAllPages(){

    // Initialize the bot to be used in subsequent calls
    const bot = await mwn.init({
        apiUrl: 'https://pl.wikinews.org/w/api.php',
        username: BOTUSERNAME,
        password: BOTPASSWORD,
        userAgent: USERAGENT,
        defaultParams: {
            assert: 'user' 
        }
    });

    for(let i=0;i<updateData.length;i++){
        const current_page = updateData[i];
        await updatePage(bot, current_page.pagename, current_page.template_location, current_page.dpl_location);
    }

}

/**
 * Just schedule the proper job to be run periodically
 */
function main(){
    let interval = 20 * 60 * 1000; //We should update the main page every 20 minutes
    updateAllPages(); // So that we don't have to wait the whole inteval for first run
    setInterval(updateAllPages, interval);
}

main();
