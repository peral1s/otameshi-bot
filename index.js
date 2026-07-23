require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  AttachmentBuilder, 
  ApplicationIntegrationType, 
  InteractionContextType 
} = require('discord.js');

// 💡 メッセージ本文を読み取るため MessageContent が必須
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// 🛠️ スラッシュコマンド定義 (/harvest)
const harvestCommand = new SlashCommandBuilder()
  .setName('harvest')
  .setDescription('Yougaの発言ログを遡ってファイルとして抽出します')
  .addIntegerOption(opt => 
    opt.setName('limit')
       .setDescription('遡る最大メッセージ件数（デフォルト: 1000件 / 最大: 5000件）')
       .setRequired(false)
  )
  .setIntegrationTypes([
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall
  ])
  .setContexts([
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel
  ]);

const commands = [harvestCommand.toJSON()];

// 🚀 Bot準備完了＆コマンド登録
client.once('ready', async () => {
  console.log(`🤖 ${client.user.tag} が正常に起動したのだ！`);

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('グローバルコマンドを登録中...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ /harvest コマンドの登録が完了したのだ！');
  } catch (err) {
    console.error('コマンド登録エラー:', err);
  }
});

// ⚡ インタラクション処理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'harvest') {
    await interaction.deferReply({ ephemeral: true });

    const targetUserId = process.env.YOUGA_USER_ID;
    const scanLimit = Math.min(interaction.options.getInteger('limit') || 1000, 5000);
    const channel = interaction.channel;

    let collectedLogs = [];
    let lastMessageId;
    let scannedCount = 0;

    try {
      // 100件ずつループして過去メッセージを遡る
      while (scannedCount < scanLimit) {
        const fetchAmount = Math.min(100, scanLimit - scannedCount);
        const options = { limit: fetchAmount };
        if (lastMessageId) options.before = lastMessageId;

        const fetchedMessages = await channel.messages.fetch(options);
        if (fetchedMessages.size === 0) break;

        scannedCount += fetchedMessages.size;

        // ターゲットの発言（テキストあり）のみ抽出
        fetchedMessages.forEach(msg => {
          if (msg.author.id === targetUserId && msg.content.trim().length > 0) {
            const dateStr = msg.createdAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
            collectedLogs.push(`[${dateStr}] ${msg.content}`);
          }
        });

        lastMessageId = fetchedMessages.last().id;
      }

      if (collectedLogs.length === 0) {
        return interaction.editReply({ 
          content: `…スキャンした **${scannedCount}** 件の中にYougaの発言は見つからなかったのだ` 
        });
      }

      // 古い順に並び替えてテキストファイル化
      const fileText = collectedLogs.reverse().join('\n\n');
      const buffer = Buffer.from(fileText, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `youga_logs_${Date.now()}.txt` });

      return interaction.editReply({
        content: `✅ **${scannedCount}** 件のメッセージを遡り、Yougaの発言を **${collectedLogs.length}** 件抽出したのだ！`,
        files: [attachment]
      });

    } catch (error) {
      console.error('抽出処理エラー:', error);
      return interaction.editReply({ content: '…ログの抽出中にエラーが発生したのだ。' });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
