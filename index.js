const { Client, ChannelType, EmbedBuilder } = require("discord.js");
const c = require("./config.json");
const { Poru } = require("poru");
const colorConsole = require("color-console");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");

const dir = require("./playlist.json");

const { handlerErrors } = require("./handlers/anticrash");

const client = new Client({
  intents: ["Guilds", "GuildMessages", "MessageContent", "GuildVoiceStates"],
});

const nodes = [
  {
    name: c.name,
    host: c.host,
    port: c.port,
    password: c.password
  },
];
const PoruOptions = {
  library: "discord.js",
  defaultPlatform: "ytsearch",
};

client.poru = new Poru(client, nodes, PoruOptions);

client.poru.on("queueEnd", () => {
  if (c.loop_after_finish === true) {
    colorConsole.cyan(`[INFO] Loop after finish: Enabled !`);
    playerStart2();
  } else {
    colorConsole.cyan(`[INFO] Loop after finish: Disabled !`);
  }
});

client.login(c.token).then(() => {
  client.poru.init(client);
  handlerErrors(client).then(() => {
    setTimeout(() => {
      colorConsole.cyan(`[INFO] AntiCrash Manager: Connected !`);
      playerStart2();
    }, 5000);
    colorConsole.cyan(`[INFO] Client has been started!`);
  });
});

const rest = new REST({ version: "10" }).setToken(c.token);

async function main() {
  const commands = [
    {
      name: "stop",
      description: "Stops the music",
    },
    {
      name: "play",
      description: "Start the music",
    },
    {
      name: "join",
      description: "Join your Voicechannel",
    },
    {
      name: "disconnect",
      description: "Disconnect the bot (Only works when music is stopped)",
    },
    {
      name: "pause",
      description: "Pauses the music",
    },
    {
      name: "resume",
      description: "Resumes the music",
    },
    {
      name: "nowplaying",
      description: "Shows the current playing song",
    }
  ];
  try {
    colorConsole.cyan("Started refreshing application (/) commands.");
    // Delete existing commands
    await rest.put(
      Routes.applicationGuildCommands(c.applicationid, c.guildid),
      {
        body: [], // Empty array deletes all commands
      }
    );
    await rest.put(
      Routes.applicationGuildCommands(c.applicationid, c.guildid),
      {
        body: commands,
      }
    );
  } catch (err) {
    colorConsole.red("An error has occurred: " + err);
  }
}

main();

client.on("interactionCreate", async (interaction) => {
  const voice = client.channels.cache.get(c.channelid);
  if (interaction.commandName === "play") {
    playerStart(interaction).catch(e => { colorConsole.red(e) });
  }

  if (interaction.commandName === "stop") {
    const player = client.poru.players.get(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor("Aqua")
      .setDescription("Stopped the player!");

    if (!player) {
      return interaction.reply({
        embeds: [embed.setDescription(`Player is not ready !`).setColor("Red")],
      });
    }

    player.destroy();

    return interaction.reply({
      embeds: [embed],
    });
  }
  if (interaction.commandName === "nowplaying") {
    const player = client.poru.players.get(interaction.guildId);
    if (!player) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Player is not ready !"),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setColor('White')
      // .setTitle('Now Playing | ' + player.currentTrack.info.title)
      .setDescription(player.currentTrack.info.title)
      .setImage(
        `${player.currentTrack.info.image}`,
      )
    return interaction.reply({
      embeds: [embed],
    });
  }

  if (interaction.commandName === "join") {
    if (!interaction.member.voice.channel)
      return interaction.editReply({
        content: `Please connect with voice channel `,
        ephemeral: true,
      });

    client.poru.createConnection({
      guildId: interaction.guild.id,
      voiceChannel: interaction.member.voice.channel.id,
      textChannel: interaction.channel.id,
      deaf: true,
    });

    const embed = new EmbedBuilder()
      .setColor("Aqua")
      .setDescription(`Joined ${interaction.member.voice.channel.toString()}`);

    return interaction.reply({
      embeds: [embed],
    });
  }

  if (interaction.commandName === "disconnect") {
    const player = client.poru.players.get(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor("Aqua")
      .setDescription("Disconnected the player!");

    if (!player) {
      return interaction.reply({
        embeds: [
          embed.setDescription(`Disconnected the player !`).setColor("Red"),
        ],
      });
    }
    player.destroy();
    return interaction.reply({
      embeds: [embed],
    });
  }

  if(interaction.commandName === "pause") {
    const player = client.poru.players.get(interaction.guild.id);

    if (player.isPaused) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription('Player is already paused');

      return interaction.reply({
        embeds: [embed],
      });
    }

    player.pause(true);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setDescription('Paused the player');

    return interaction.reply({
      embeds: [embed],
    });
  }

  if(interaction.commandName === "resume") {
    const player = client.poru.players.get(interaction.guild.id);

    if (!player.isPaused) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription('Player is not paused !');

      return interaction.reply({
        embeds: [embed],
      });
    }

    player.pause(false);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setDescription('Paused has been successfully unpaused!');

    return interaction.reply({
      embeds: [embed],
    });
  }
});

async function playerStart2() {
  const shuffledDir = shuffleArray(dir); // Shuffle the array of songs

  const res = await Promise.all(
    shuffledDir.map(async (search) => {
      const result = await client.poru.resolve({
        query: search,
        source: "scsearch",
        requester: c.bot_name,
      });
      return result;
    })
  );

  const player = client.poru.createConnection({
    guildId: c.guildid,
    voiceChannel: c.channelid,
    deaf: true,
  });


  for (const result of res) {
    if (result.loadType === "LOAD_FAILED") {
      colorConsole.red("Failed to load track.");
      continue;
    } else if (result.loadType === "NO_MATCHES") {
      colorConsole.red("No source found!");
      continue;
    }

    if (result.loadType === "PLAYLIST_LOADED") {
      for (const track of result.tracks) {
        track.info.requester = c.bot_name;
        player.queue.add(track);
      }
    } else {
      const track = result.tracks[0];
      track.info.requester = c.bot_name;
      player.queue.add(track);
    }
  }

  if (!player.isPlaying && player.isConnected) player.play();
}

async function playerStart(interaction) {
  await interaction.deferReply();

  const shuffledDir = shuffleArray(dir); // Shuffle the array of songs
  const player = client.poru.createConnection({
    guildId: interaction.guild.id,
    voiceChannel: interaction.member.voice.channelId,
    textChannel: interaction.channel.id,
    deaf: true,
  });

  for (const search of shuffledDir) {
    const res = await client.poru.resolve({
      query: search,
      source: "scsearch",
      requester: interaction.member,
    });

    if (res.loadType === "LOAD_FAILED") {
      interaction.editReply("Failed to load track.");
      continue;
    } else if (res.loadType === "NO_MATCHES") {
      interaction.editReply("No source found!");
      continue;
    }

    if (res.loadType === "PLAYLIST_LOADED") {
      for (const track of res.tracks) {
        track.info.requester = interaction.user;
        player.queue.add(track);
      }
    } else {
      const track = res.tracks[0];
      track.info.requester = interaction.user;
      player.queue.add(track);
      interaction.editReply({
        embeds: [
          {
            title: "Started!",
            description: `Connected to: ${interaction.member.voice.channel}\n- ${track.info.title}`,
            color: 15503085,
          },
        ],
      });
    }
  }

  if (!player.isPlaying && player.isConnected) player.play();
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}