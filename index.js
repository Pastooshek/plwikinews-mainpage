const { mwn } = require('mwn'); 
const config = require('./config.json');


const BOTUSERNAME = config.bot_username;
const BOTPASSWORD = config.bot_password;
const USERAGENT = config.user_agent; //https://meta.wikimedia.org/wiki/User-Agent_policy 

/*
*   This function purges cache of a given page, allowing it to be "refreshed"
*   Quite important to call it after changing contents of the main page
*/
async function purgePage(title){

    const bot = await mwn.init({
        apiUrl: 'https://pl.wikinews.org/w/api.php',
        username: BOTUSERNAME,
        password: BOTPASSWORD,
        userAgent: USERAGENT,
        defaultParams: {
            assert: 'user' 
        }
    });

    let x = await bot.request({
        action: 'purge',
        titles: title
    });

}

/*
*   Function that refreshes the Dynamic Page List the bot uses by performing a null edition.
*   Technically we could purge the cache here, but by hardcoding the contents of page we've got an additional layer of protection agains vandals :)
*/
async function refreshDPL(){ 

    const bot = await mwn.init({
        apiUrl: 'https://pl.wikinews.org/w/api.php',
        username: BOTUSERNAME,
        password: BOTPASSWORD,
        userAgent: USERAGENT,
        defaultParams: {
            assert: 'user'
        }
    });

    let content =
    `<DynamicPageList>
    namespace=0
    count=5
    notcategory=tworzone
    notcategory=archiwalne
    notcategory=Wyróżnione
    </DynamicPageList>`;

    await bot.save("Wikireporter:PastooshekBOT/Najnowsze", content, "Bot odświeża listę najnowszych artykułów");

}

/*
*   Function that gets the API response and searches for a category that the particular article should be associated with.
*/
async function getPortal(ans){
    ans = ans.revisions[0].content;

    const pattern = /{{(Gospodarka|Katastrofy|Kultura|Nauka|Polityka|Prawo i przestępczość|Sport|Społeczeństwo|Technika)/i; 
    let date = ans.match(pattern);
    if(date == null){
        return "";
    }
    else{
        let x = date[0].substring(2);
        x  = x[0].toUpperCase() + x.substr(1);
        return x;
    }
}

/*
*   Gets the API response, looks for the date of article's creation
*/
async function getDate(ans){

    ans = ans.revisions[0].content;

    const pattern = /{{data\|.*}}/i;  //Loking for a particular template that contains info we need
    let date = ans.match(pattern);
    if(date == null){
        return "";
    }
    else{
        return date[0].substring(7,17);
    }
}

/*
*   Gets the API response, checks if there is an image in the text. 
*   If there is, it should return its name (or blank string if there was no image found).
*/
async function getImage(ans){

    ans = ans.revisions[0].content;

    //Yes, those regexes are scary, but @Msz2001 made sure they do indeed work!
    let pattern = /\|[^|=\[\]\n]*\.(JPG|PNG|JPEG|WEBP|GIF|TIF|TIFF|BMP|SVG)/i;
    let image = ans.match(pattern);
    if(image == null){
        pattern = /\[\[Plik:.*\.(JPG|PNG|JPEG|WEBP|GIF|TIF|TIFF|BMP|SVG)/i; 
        image = ans.match(pattern);

        if(image == null){
            return "";
        }
        else{
            return image[0].substring(7);
        }
        
    }
    else{
        return image[0].substring(1);
    }
}

/*
*   Gets the response from the API and returns the article lead.
*   The lead should be written in bold to be recognized
*/
async function getLead(ans){

    ans = ans.revisions[0].content;

    const pattern = /'''.*'''/; //Looking for text in bold (as specified earlier)
    
    let lead = ans.match(pattern);
    if(lead===null){
        return "";
    }
    else{
        return lead[0].substring(3,lead[0].length-3);
    }
}

/*
*   Checks the 5 newest articles that are provided via the dynamic page list.
*   It's not the cleanest implementation, but it works sufficiently.
*   Please note that said list excludes articles with {{tworzone}} template.
*/
async function getTop5(){

    await refreshDPL(); //Refreshing dynamic page list
    const title = 'Wikireporter:PastooshekBOT/Najnowsze';

    const bot = await mwn.init({
        apiUrl: 'https://pl.wikinews.org/w/api.php',
        username: BOTUSERNAME,
        password: BOTPASSWORD,
        userAgent: USERAGENT,
        defaultParams: {
            assert: 'user'
        }
    });

    let ans = await bot.parseTitle(title); //We need to parse the contents of the page before using regex on it.

    const regex = /title=.*\">/g; 
    let arrayOfMatches = ans.match(regex);

    for(let i=0;i<arrayOfMatches.length;i++){
        arrayOfMatches[i]=arrayOfMatches[i].substr(7); //This function is deprecated; somebody will need to refactor it one day
        arrayOfMatches[i]=arrayOfMatches[i].substr(0,arrayOfMatches[i].length-2);
    }

    return arrayOfMatches;
}

/*
*   "where" is a subpage of the main page where we should put the sneak peak of a given article
*   "what" is a title of said article
*/

async function generateSneakPeak(where, what){

    const bot = await mwn.init({
        apiUrl: 'https://pl.wikinews.org/w/api.php',
        username: BOTUSERNAME,
        password: BOTPASSWORD,
        userAgent: USERAGENT,
        defaultParams: {
            assert: 'user' 
        }
    });

    let ans = await bot.read(what); //Answer from the API

    //We create a string matching specifications for a sneak peak of an article. 
    //Those specifications were provided by Msz2001.
    let content =
        `{{Strona główna/Wycinek artykułu
        |tytuł=${what}
        |data=${await getDate(ans)}
        |treść=${await getLead(ans)}
        |obrazek=${await getImage(ans)}
        |portal=${await getPortal(ans)}
        |duży={{{duży|}}}
        }}`;
        
        await bot.save(where, content, "Bot zmienia artykuł do ekspozycji");
        
}

/*
*   Function tasked with updating main page, called by the main() every 20 minutes
*/
async function updateMainPage(){

    let arr = await getTop5();

    const pref = "Szablon:Strona główna/Artykuł "; //after adding a number it should look like this: Szablon:Strona główna/Artykuł 1 
  
    for(let i=0;i<5;i++){ //This "5" represents 5 articles we are going to represent. We might need to change that value in the future to match our demands.
        let pageToChange = pref + (i+1); 
        await generateSneakPeak(pageToChange, arr[i]);
    }
    await purgePage("Strona główna"); //Purging the main page to make sure that changes we've made can be seen by everybody 
}

/*
*   We all know what this is supposed to do ;)
*/
function sleep(seconds) {
    return new Promise((wait) => { setTimeout(wait, seconds*1000) });
} 

/*
*   This is not a proper way of doing that, but it should work for now
*/
async function main(){
   let interval = 20 * 60; //We should update the main page every 20 minutes 
    while(true){
        updateMainPage();
        await sleep(interval);
    }

}

main()

