import wixData from 'wix-data';
import wixUsers from 'wix-users';
import {getUserName} from 'public/shared.js'

let cachedLowBG = "70";
let cachedHighBG = "180";
let cachedURL;

$w.onReady(function () {
    $w('#saveButton').disable();
    $w('#lowBG').onInput(() => {
        $w('#saveButton').enable();
    });
     $w('#nightscoutURL').onInput(() => {
        $w('#saveButton').enable();
    });
    $w('#highBG').onInput(() => {
        $w('#saveButton').enable();
    });
    $w('#unitsRadio').onChange(() => {
        $w('#saveButton').enable();
    });
    const user = wixUsers.currentUser;
    const userId = user.id;
    
    getUserName(userId)
    .then(nick => {
      $w('#welcomeText').text = `Welcome, ${nick}!`;
    });

    // Load user settings
    wixData.query("UserPreferences")
        .eq("userId", userId)
        .find()
        .then((results) => {
            if (results.items.length > 0) {
                // Existing record found: fill form with saved data
                const prefs = results.items[0];
				console.log("PREFS: ", prefs);
				if (prefs.units === 'mgdl') {
					$w('#unitsRadio').value = "mgdl";   // your radio button value
				} else {
					$w('#unitsRadio').value = "mmol";  // your radio button value
				}
				cachedLowBG = prefs.lowbg;
				cachedHighBG = prefs.highbg;
                cachedURL = prefs.nightscouturl;

            } else {
				console.log("Did not get results");
            }

			$w('#lowBG').value = cachedLowBG
			$w('#highBG').value = cachedHighBG;
			$w('#nightscoutURL').value = cachedURL;
        });
});

$w('#saveButton').onClick((event) => {

    cachedHighBG = $w('#highBG').value || cachedHighBG;
    cachedLowBG = $w('#lowBG').value || cachedLowBG;
    cachedURL = $w('#nightscoutURL').value  || cachedURL;

    const userId = wixUsers.currentUser.id;
    console.log("low On Save: ", cachedLowBG);
    console.log("high On Save: ", cachedHighBG);
	console.log("URL On Save: ", cachedURL);

    const prefs = {
        userId: userId,
		units: $w('#unitsRadio').value,
        lowbg: $w('#lowBG').value,
        highbg: $w('#highBG').value,
        nightscouturl: $w('#nightscoutURL').value
    };


    // Check if user already has a record
    wixData.query("UserPreferences")
        .eq("userId", userId)
        .find()
        .then((results) => {
            if (results.items.length > 0) {
                // Update existing record
                prefs._id = results.items[0]._id;
                wixData.update("UserPreferences", prefs)
                    .then(() => {
                        console.log("Preferences updated successfully!");
                    });
            } else {
                // Insert new record
                wixData.insert("UserPreferences", prefs)
                    .then(() => {
                        console.log("Preferences saved successfully!");
                    });
            }
        });
    $w('#saveButton').disable();
});

