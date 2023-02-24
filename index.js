const { Client, IntentsBitField } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const ytdl = require('ytdl-core');
const search = require('yt-search');
const { Routes } = require('discord-api-types/v9');
const { createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, joinVoiceChannel } = require('@discordjs/voice');
require('dotenv').config()

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildVoiceStates,
    ]
});

token = process.env.YOUR_DISCORD_BOT_TOKEN

let queue = []; // queue to hold requested songs
let isPlaying = false; // flag to indicate if a song is currently playing
const player = createAudioPlayer(); // define player variable in a higher scope
let connection;

const playCommand = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song.')
    .addStringOption(option => option.setName('song').setDescription('The song you want to play.'))
    .addBooleanOption(option => option.setName('important').setDescription('Prioritize playing this song.'));

const skipCommand = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song.');

const stopCommand = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing songs.');

const disconnectCommand = new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect the bot from the voice channel.');

const commands = [
    playCommand.toJSON(),
    skipCommand.toJSON(),
    stopCommand.toJSON(),
    disconnectCommand.toJSON(),
];

const rest = new REST({ version: '9' }).setToken(token);

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    client.user.setPresence({
        status: 'online',
        activity: {
            type: 'LISTENING',
            name: 'Type !help for commands'
        }
    });
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') {
        const voiceChannel = interaction.member.voice.channel
        if (!voiceChannel) {
            await interaction.reply('You need to join a voice channel first!');
        }
        console.log('Connected to voice channel:', interaction.member.voice.channel.name);

        let requestedSong = interaction.options.getString('song');
        const important = interaction.options.getBoolean('important') || false;

        if (important && isPlaying) {
            player.pause();
            queue.unshift(requestedSong); // move the current song to the front of the queue
        } else {
            queue.push(requestedSong);
            if (isPlaying) {
                await interaction.reply('Added on queue!');
                return;
            }

        }

        isPlaying = true;

        try {
            connection = await joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: true
            });

            await playSong(requestedSong, connection, interaction);

        } catch (error) {
            console.error(error);
            await interaction.reply('An error occurred while trying to play music!');
        }

    } else if (commandName === 'skip') {
        if (isPlaying) {
            player.pause();
            await interaction.reply(`Skipped!`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            queue.shift(); // remove the first song from the queue since it's now stopped
            if (queue.length > 0) {
                isPlaying = true;
                await playSong(queue[0], connection, interaction);
            } else {
                isPlaying = false;
                return;
            }
        } else {
            await interaction.reply("No song is currently playing!");
        }
    } else if (commandName === 'stop') {
        if (isPlaying) {
            // stop playing the current song
            player.pause();

            // remove all songs from the queue
            queue = [];

            // set the "isPlaying" flag to false
            isPlaying = false;

            // send a message confirming that the queue has been cleared
            await interaction.reply("The queue has been cleared.");
        } else {
            await interaction.reply("No song is currently playing!");
        }
    } else if (commandName === 'disconnect') {
        // stop playing the current song
        player.stop();

        // remove all songs from the queue
        queue = [];

        // set the "isPlaying" flag to false
        isPlaying = false;

        // disconnect from the voice channel
        if (connection) {
            connection.destroy();
        }

        await interaction.reply(`${interaction.member.voice.channel.name} channel disconnected.`);
    }
});

async function playSong(song, connection, interaction) {
    try {
        if (!isValidURL(song)) {
            song = await searchVideo(song);
        }
        if (interaction.replied) await interaction.followUp(`Played!`);
        else await interaction.reply(`Played!`);
        const stream = await ytdl(song, { filter: 'audioonly' });
        const resource = createAudioResource(stream);
        player.play(resource);
        connection.subscribe(player);
        await entersState(player, AudioPlayerStatus.Playing, 5_000);

        player.on(AudioPlayerStatus.Idle, () => {
            connection.destroy();
            if (queue.length > 0) {
                isPlaying = true;
                playSong(song, connection, interaction);
                queue.shift(); // remove the first song from the queue since it's now playing
            } else {
                isPlaying = false;
            }
        });
    } catch (error) {
        console.error(error);
        await interaction.reply('An error occurred while trying to play music!');
    }
}

function isValidURL(string) {
    const pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
        '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
        '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
        '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
    return pattern.test(string);
}

async function searchVideo(keyword) {
    const { videos } = await search(keyword);
    return videos[0].url;
}

client.on('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands })
            .then(() => console.log('Registered slash commands!'))
            .catch(console.error);
    } catch (error) {
        console.error(error);
    }
});

client.login(token);