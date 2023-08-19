const axios = require('axios');
const config = require('./config.json');
const { Client, Intents, MessageEmbed } = require('discord.js');
const myIntents = new Intents([Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]);
const client = new Client({ intents: myIntents });

const funnyMessages = [
    "Hold on, you sniffy little rascal!",
    "Processing... be patient, you cheeky devil!",
    "Hang tight, mischievous human!",
    "Bear with me, you impish fellow!",
    "Working on it, you sly boots!",
    "One moment, you crafty minx!",
    "Don't rush perfection, you sneaky snake!",
    "Getting there... stay with me, you playful pixie!",
    "Keep your pants on, you saucy sailor!",
    "You think this is easy? Hold your horses, you jester!",
    "On it! But don’t rush genius, you spirited sprite!",
    "Whipping the hamsters to work faster for you, you cheeky chimp!",
    "I see what you're trying to do. Wait up, you cunning coyote!",
    "Shuffling some bits and bobs for you, you rascally rabbit!",
    "Stay put! Or don’t... I’m not the boss of you, you wild weasel!",
    "Twiddling my virtual thumbs for you, you zany zealot!",
    "Would you like a cuppa while you wait, you daring dingo?",
    "Hold on to your knickers, it's coming up, you feisty ferret!",
    "Hold the phone! We're almost there, you mirthful meerkat!",
    "Look alive! I'm on it, you whimsical wombat!"
];

client.once('ready', () => {
    console.log('Bot is ready!');
});

client.on('messageCreate', async message => {
    if (message.author.bot || message.channel.id !== config.channelID) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'friends') {
        const steamIDs = args.filter(id => /^\d{17}$/.test(id));
        if (steamIDs.length === 0) {
            message.channel.send('Please provide valid Steam IDs separated by a space.');
            return;
        }

        // Notify the user that the bot is processing the request with a random funny message
        const processingMessage = await message.channel.send(`${message.author.toString()}, ${getRandomFunnyMessage()}`);

        const formattedSteamIDs = await formatSteamProfiles(steamIDs);
        const mutualFriends = await getMutualFriends(steamIDs);

        processingMessage.delete();  // Remove the interim message

        // Sending the search criteria embed
        const criteriaEmbed = new MessageEmbed()
            .setTitle('Search Criteria')
            .setDescription(formattedSteamIDs.join('\n'));
        
        message.channel.send({ embeds: [criteriaEmbed] });

        // If no mutual friends are found
        if (mutualFriends.length === 0) {
            const noMatchEmbed = new MessageEmbed()
                .setTitle('Results')
                .setDescription('No match found.');

            message.channel.send({ embeds: [noMatchEmbed] });
            return;
        }

        // Send mutual friends in groups of 10 per embed
        for (let i = 0; i < mutualFriends.length; i += 10) {
            const chunk = mutualFriends.slice(i, i + 10);
            const resultEmbed = new MessageEmbed()
                .setTitle('Results')
                .setDescription(chunk.join('\n'));
            
            message.channel.send({ embeds: [resultEmbed] });
        }
    }
});


function getRandomFunnyMessage() {
    const randomIndex = Math.floor(Math.random() * funnyMessages.length);
    return funnyMessages[randomIndex];
}

async function fetchSteamProfile(steamID) {
    // Fetch the basic profile details
    const profileResponse = await axios.get(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${config.steamAPIKey}&steamids=${steamID}`);
    const playerData = profileResponse.data.response.players[0];

    // Escape any Markdown characters in the profile name to prevent formatting issues
    const escapedName = playerData.personaname.replace(/[\[\]\(\)\*\_\~\>\#\&]/g, '\\$&');

    // Fetch the playtime for DayZ
    const gamesResponse = await axios.get(`http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${config.steamAPIKey}&steamid=${steamID}&appids_filter[0]=221100`);
    const dayzGame = gamesResponse.data.response?.games?.[0];

    if (!dayzGame) {
        return null; // Return null if no DayZ owned.
    } 

    const playtime = dayzGame.playtime_forever || 0; // This will be in minutes
    const playtimeForDayZ = `${Math.floor(playtime / 60)} hours ${playtime % 60} minutes`;

    return `[${escapedName}](${playerData.profileurl}) - DayZ: ${Math.floor(playtime / 60)}h ${playtime % 60}m`;

}

async function fetchFriends(steam64ID) {
    const endpoint = `http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${config.steamAPIKey}&steamid=${steam64ID}&relationship=friend`;

    try {
        const response = await axios.get(endpoint);
        if (response.data && response.data.friendslist && response.data.friendslist.friends) {
            const friends = response.data.friendslist.friends;
            return friends.map(friend => friend.steamid);
        } else {
            console.log('No friends found or unexpected API response.');
            return [];
        }
    } catch (error) {
        console.error('Error fetching friends:', error.message);
        return [];
    }
}

async function formatSteamProfiles(steamIDs) {
    const formatted = [];
    for (const id of steamIDs) {
        const profileString = await fetchSteamProfile(id);
        const defaultProfileString = await fetchDefaultSteamProfile(id); // Fetch without checking for DayZ
        formatted.push(profileString || defaultProfileString); // Use the profile string if it exists; otherwise, use the default
    }
    return formatted;
}

async function fetchDefaultSteamProfile(steamID) {
    // Fetch the basic profile details without checking for DayZ
    const profileResponse = await axios.get(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${config.steamAPIKey}&steamids=${steamID}`);
    const playerData = profileResponse.data.response.players[0];
    
    // Escape any Markdown characters in the profile name to prevent formatting issues
    const escapedName = playerData.personaname.replace(/[\[\]\(\)\*\_\~\>\#\&]/g, '\\$&');
    
    return `[${escapedName}](${playerData.profileurl}) - DayZ: Not Owned`;

}


async function getMutualFriends(steamIDs) {
    const allFriends = [];

    for (const id of steamIDs) {
        const friends = await fetchFriends(id);
        allFriends.push(new Set(friends));
    }

    const mutuals = [...allFriends[0]].filter(id => allFriends.every(set => set.has(id)));
    const results = [];

    for (const mutualId of mutuals) {
        const profileString = await fetchSteamProfile(mutualId);
        if (profileString) {  // Check if profileString is not null
            results.push(profileString);
        }
    }

    return results;
}

client.login(config.discordToken);
