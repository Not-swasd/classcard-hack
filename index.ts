import { CategoryChannel, Client, Collection, Message, TextChannel, EmbedBuilder, Partials, ComponentType, ChannelType, ModalBuilder, ActionRowBuilder, TextInputStyle, ModalActionRowComponentBuilder, TextInputBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ActivityType } from "discord.js";
import { Activity, ClassCard, QuizBattle, SetType, BattleQuest } from "./classcard.js";
import * as fs from "fs";
import * as crypto from "crypto";

if (!fs.existsSync("./config.json")) {
    fs.writeFileSync("./config.json", JSON.stringify({ token: "디스코드 봇 토큰", owners: ["디스코드 봇 소유자 아이디"], prefix: "!", guild: "", ticketCategory: "", ticketChannel: "" }, null, 4));
    console.info("config.json를 수정해주세요.");
    process.exit(0);
};
if (!fs.existsSync("./users.json")) fs.writeFileSync("./users.json", "{}");
let config: {
    token: string,
    owners: string[],
    prefix: string,
    guild: string,
    ticketCategory: string,
    ticketChannel: string,
    secret?: string
} = JSON.parse(fs.readFileSync("./config.json", "utf8"));
let secret: string = config.secret && config.secret.length === 32 ? config.secret : randPassword(32);
let users: {
    [key: string]: {
        id: string,
        password: string,
        channelID: string,
        messageID: string,
        setID: number,
        classID: number,
    }
} = JSON.parse(fs.readFileSync("./users.json", "utf8"));

let classes: { [id: string]: ClassCard } = {};
let qbClasses: { [id: string]: QuizBattle } = {};

const client: Client = new Client({
    "intents": [
        "DirectMessageReactions",
        "DirectMessageTyping",
        "DirectMessages",
        "GuildBans",
        "GuildEmojisAndStickers",
        "GuildIntegrations",
        "GuildInvites",
        "GuildMembers",
        "GuildMessageReactions",
        "GuildMessageTyping",
        "GuildMessages",
        "GuildPresences",
        "GuildScheduledEvents",
        "GuildVoiceStates",
        "GuildWebhooks",
        "Guilds",
        "MessageContent"
    ],
    "partials": [
        Partials.Channel,
        Partials.GuildMember,
        Partials.GuildScheduledEvent,
        Partials.Message,
        Partials.Reaction,
        Partials.ThreadMember,
        Partials.User,
    ]
});

console.info("잠시만 기다려주세요.");
await Promise.all(Object.keys(users).map(async id => {
    try {
        if (!classes[id]) classes[id] = new ClassCard();
        if (decrypt(users[id].id) && decrypt(users[id].password)) {
            let res = await classes[id].login(decrypt(users[id].id), decrypt(users[id].password)).then(res => res?.success);
            if (!res) {
                users[id].id = "";
                users[id].password = "";
                users[id].setID = 0;
                users[id].classID = 0;
            };
        } else {
            users[id].id = "";
            users[id].password = "";
            users[id].setID = 0;
            users[id].classID = 0;
        };
        if (users[id].classID && !(await classes[id].setClass(users[id].classID).then(res => res?.success))) users[id].classID = 0;
        if (users[id].setID && !(await classes[id].setSet(users[id].setID).then(res => res?.success))) users[id].setID = 0;
        saveUsers();
    } catch { };
}));
console.clear();
client.login(config.token);

process.on("unhandledRejection", (e) => console.error(e));
process.on("uncaughtException", (e) => console.error(e));

client.on("ready", () => {
    console.info("Logged in as " + client.user?.tag);
    client.user!.setActivity({ name: "ClassCard", type: ActivityType.Watching, url: "https://classcard.net" });
    Object.keys(users).forEach(async id => {
        if (!users[id].channelID || !users[id].messageID) return;
        let guild = client.guilds.cache.get(config.guild)
        if (!guild) return;
        let channel = guild.channels.cache.get(users[id].channelID) as TextChannel;
        if (!channel) return;
        let message = await channel.messages.fetch(users[id].messageID).catch(() => undefined);
        if (!message) {
            channel.delete();
            users[id].channelID = "";
            users[id].messageID = "";
            saveUsers();
            return;
        };
        updateMessage(message, id, "edit");
    });
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (!users[interaction.user.id]) users[interaction.user.id] = { id: "", password: "", channelID: "", messageID: "", setID: 0, classID: 0 };
        saveUsers();
        const user = users[interaction.user.id];
        if (interaction.isButton()) {
            const channel = interaction.channel as TextChannel;
            if (!channel.topic?.includes("Created By " + client.user?.username)) return;
            if (!interaction.customId.startsWith("_")) await interaction.reply({ embeds: [new EmbedBuilder().setTitle("⚙️ 잠시만 기다려주세요.").setColor("Green")], ephemeral: true });
            if (interaction.customId === "create_ticket") {
                let channel = interaction.guild?.channels.cache.get(user.channelID) as TextChannel;
                if (user.channelID && channel) await channel.delete();
                channel = await (interaction.guild?.channels.cache.get(config.ticketCategory) as CategoryChannel).children.create({ "name": interaction.user.username.toLowerCase() /* ＃${interaction.user.discriminator} */, "topic": "Created By " + client.user?.username + " | USER: " + interaction.user.id });
                users[interaction.user.id].channelID = channel.id;
                if (!classes[interaction.user.id]) classes[interaction.user.id] = new ClassCard();
                let message = await updateMessage(channel, interaction.user.id, "send") as Message;
                if (message.id) users[interaction.user.id].messageID = message.id;
                else {
                    users[interaction.user.id].messageID = "";
                    users[interaction.user.id].channelID = "";
                    saveUsers();
                    if (channel) channel.delete();
                    return;
                };
                saveUsers();
                await channel.permissionOverwrites.create(interaction.user, { "ViewChannel": true, "SendMessages": true });
                interaction.editReply({ "embeds": [new EmbedBuilder().setTitle("✅ Success").setDescription(`설정이 완료되었습니다. 채널: <#${channel.id}>`).setColor("Green")] });
                return;
            };
            if (!channel.topic.split("|")[1].includes(interaction.user.id)) {
                interaction[interaction.replied ? "editReply" : "reply"]({ embeds: [new EmbedBuilder().setTitle("❌ 티켓을 만든 유저만 사용할 수 있습니다.").setColor("Red")], ephemeral: true });
                return;
            };
            if (interaction.customId.startsWith("s_") && !user.setID) {
                interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 세트를 설정한 뒤 사용해주세요.").setColor("Red")] });
                return;
            };
            if (interaction.customId === "delete_channel") {
                let message = await interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("⚠️ 정말 채널을 삭제하시겠습니까?").setColor("Yellow")],
                    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setLabel("네").setStyle(ButtonStyle.Success).setCustomId("_yes"),
                        new ButtonBuilder().setLabel("아니요").setStyle(ButtonStyle.Danger).setCustomId("_no")
                    )]
                }) as Message;
                let i = await message.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 0, componentType: ComponentType.Button }).then(async (inter) => {
                    if (inter.customId !== "_yes") return false;
                    await channel.delete();
                    users[interaction.user.id].channelID = "";
                    users[interaction.user.id].messageID = "";
                    saveUsers();
                    return true;
                }).catch(() => false);
                if (!i) interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("✅ 취소되었습니다.").setColor("Green")],
                    components: []
                }).catch(() => false);
                return;
            } else if (interaction.customId === "delete_info") {
                let message = await interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("⚠️ 정말 저장된 정보를 삭제하시겠습니까?").setColor("Yellow")],
                    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setLabel("네").setStyle(ButtonStyle.Success).setCustomId("_yes"),
                        new ButtonBuilder().setLabel("아니요").setStyle(ButtonStyle.Danger).setCustomId("_no")
                    )]
                }) as Message;
                let i = await message.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 0, componentType: ComponentType.Button }).then(async (inter) => {
                    if (inter.customId !== "_yes") return false;
                    users[interaction.user.id].id = "";
                    users[interaction.user.id].password = "";
                    users[interaction.user.id].setID = 0;
                    users[interaction.user.id].classID = 0;
                    delete classes[interaction.user.id];
                    classes[interaction.user.id] = new ClassCard();
                    saveUsers();
                    updateMessage(interaction.channel?.messages.cache.get(user.messageID), interaction.user.id, "edit");
                    return true;
                }).catch(() => false);
                if (!i) interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("✅ 취소되었습니다.").setColor("Green")],
                    components: []
                }).catch(() => false);
                else interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("✅ 정보가 삭제되었습니다.").setColor("Green")],
                    components: []
                }).catch(() => false);
                return;
            } else if (interaction.customId === "_set_id_pass") {
                interaction.showModal(new ModalBuilder()
                    .setTitle("아이디와 비밀번호를 입력해주세요.")
                    .setCustomId("_set_id_pass")
                    .addComponents(
                        new ActionRowBuilder<ModalActionRowComponentBuilder>()
                            .addComponents(
                                new TextInputBuilder()
                                    .setCustomId("id")
                                    .setLabel("아이디")
                                    .setStyle(TextInputStyle.Short)
                                    .setMinLength(5)
                                    .setMaxLength(20)
                                    .setPlaceholder("아이디")
                                    .setRequired(true)
                            ),
                        new ActionRowBuilder<ModalActionRowComponentBuilder>()
                            .addComponents(
                                new TextInputBuilder()
                                    .setCustomId("password")
                                    .setLabel("비밀번호")
                                    .setStyle(TextInputStyle.Short)
                                    .setMinLength(1)
                                    .setMaxLength(50)
                                    .setPlaceholder("비밀번호")
                                    .setRequired(true)
                            )
                    )
                );
            } else if (interaction.customId === "_set_set") {
                interaction.showModal(new ModalBuilder()
                    .setTitle("세트 정보를 입력해주세요.")
                    .setCustomId("_set_set")
                    .addComponents(
                        new ActionRowBuilder<ModalActionRowComponentBuilder>()
                            .addComponents(
                                new TextInputBuilder()
                                    .setCustomId("set_id")
                                    .setLabel("세트 아이디")
                                    .setStyle(TextInputStyle.Short)
                                    .setMinLength(1)
                                    .setMaxLength(20)
                                    .setPlaceholder("0000000")
                                    .setRequired(true)
                            )
                    )
                );
            } else if (interaction.customId === "get_sets") {
                let folders: { id: number, name: string, isFolder?: boolean }[] = [];
                let result = await classes[interaction.user.id].getClasses();
                if (!result?.success) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 오류가 발생했습니다.").setDescription(result?.error?.stack ? result.error.stack.length < 4000 ? result.error.message : result.error.stack : "알 수 없는 오류입니다.").setColor("Red")] });
                    return;
                };
                folders = result.data! || [];
                let message = await interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("❓ 세트를 가져올 클래스를 선택해주세요.").setColor("Yellow")],
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId("class_select_1")
                            .setPlaceholder("클래스를 선택해주세요.")
                            .setMinValues(1)
                            .setMaxValues(1)
                            .addOptions(folders.map(f => {
                                return {
                                    label: f.name,
                                    value: String(f.isFolder ? f.name : f.id),
                                    description: (f.isFolder ? "폴더" : "클래스")
                                };
                            }))
                    )]
                }) as Message;
                let i: string | false = await message.awaitMessageComponent({ filter: (i) => i.user.id === interaction.user.id, time: 0, componentType: ComponentType.SelectMenu }).then((interaction) => interaction.values[0]).catch(() => false);
                if (!i) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 알 수 없는 오류입니다.").setColor("Red")], components: [] });
                    return;
                };
                const classId = Number(i);
                let setsResult = await classes[interaction.user.id].getSetsFromClass(classId);
                if (!setsResult?.success || !setsResult.data) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 오류가 발생했습니다.").setDescription(setsResult?.error?.stack && setsResult.error.stack.length < 4000 ? setsResult.error.message : "알 수 없는 오류입니다.").setColor("Red")], components: [] });
                    return;
                };
                users[interaction.user.id].classID = classId;
                saveUsers();
                updateMessage(interaction.channel?.messages.cache.get(user.messageID), interaction.user.id, "edit");
                let sets = setsResult.data;
                var description = sets.length < 1 ? `이 클래스에 세트가 하나도 없습니다.` : "\`세트 이름\` [세트 아이디]\n\n" + sets.map(s => `\`${s.name}\` [${s.id}]`).join("\n");
                if (description.length > 3800) description = "세트가 너무 많아서 다 표시할 수 없습니다. 수동으로 가져와주세요.\n클래스 -> 세트 -> 오른쪽 위에 있는 ... -> 세트공유를 누르고 url에서 ~~.net/set/ 이 뒤에 있는 숫자가 세트 아이디입니다.";
                interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle(`✅ **${folders.find(x => x.id === classId)?.name}**에 있는 세트 목록`).setColor("Green").setDescription(description)],
                    components: []
                });
            } else if (["s_memorize", "s_recall", "s_spell"].includes(interaction.customId)) {
                let result = await classes[interaction.user.id].sendLearnAll(Activity[(interaction.customId === "s_memorize" ? "Memorize" : interaction.customId === "s_recall" ? "Recall" : "Spell")]);
                updateMessage(interaction.channel?.messages.cache.get(user.messageID), interaction.user.id, "edit");
                if (!result?.success) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 오류가 발생했습니다.").setDescription(result?.error?.stack ? result.error.stack.length < 4000 ? result.error.message : result.error.stack : "알 수 없는 오류입니다.").setColor("Red")] });
                    return;
                };
                interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("✅ 학습 완료.").addFields([
                        {
                            "name": "before",
                            "value": String(result.data?.before) + "%",
                            "inline": true
                        },
                        {
                            "name": "after",
                            "value": String(result.data?.after) + "%",
                            "inline": true
                        }
                    ]).setColor("Green")]
                });
            } else if (["s_match_scramble", "s_crash"].includes(interaction.customId)) {
                await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❓ 원하는 점수를 입력해주세요.").setColor("Yellow")] });
                let collected: Collection<string, Message<boolean>> | false = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    time: 30000,
                    max: 1,
                    errors: ["time"]
                }).catch(() => interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 시간이 초과되었습니다.").setColor("Red")] }).then(() => false));
                if (!collected || !collected.first()) return;
                await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("⚙️ 잠시만 기다려주세요.").setColor("Aqua")] });
                collected.first()?.delete();
                let score = parseInt(String(collected.first()?.content));
                let scoreUnit = interaction.customId === "s_match_scramble" ? 100 : 10;
                if (isNaN(score) || score > 990000 || score < scoreUnit) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`❌ 점수를 ${score % scoreUnit != 0 ? scoreUnit + "점 단위로" : isNaN(score) ? "숫자로만" : score > 990000 ? "990000점 이하로" : (scoreUnit + "점 이상으로")} 입력해주세요.`).setColor("Red")] });
                    return;
                };
                let result = await classes[interaction.user.id].addGameScore((interaction.customId === "s_match_scramble" ? Activity["매칭"] : Activity["크래시"]), score, true);
                if (!result?.success) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 오류가 발생했습니다.").setDescription(result?.error?.stack ? result.error.stack.length < 4000 ? result.error.message : result.error.stack : "알 수 없는 오류입니다.").setColor("Red")] });
                    return;
                };
                let embed = new EmbedBuilder().setTitle("✅ " + result.message).setColor("Green");
                if (result.data?.rank) {
                    if (result.data.rank.all) embed.addFields([{
                        "name": "전체 순위",
                        "value": String(result.data.rank.all) + (typeof result.data.rank.all === "number" ? "위" : ""),
                        "inline": true
                    }]);
                    if (result.data.rank.class) embed.addFields([{
                        "name": "반 순위",
                        "value": String(result.data.rank.class) + (typeof result.data.rank.class === "number" ? "위" : ""),
                        "inline": true
                    }]);
                };
                interaction.editReply({ embeds: [embed] });
            } else if (interaction.customId === "s_test") {
                let result = await classes[interaction.user.id].postTest();
                updateMessage(interaction.channel?.messages.cache.get(user.messageID), interaction.user.id, "edit");
                if (!result?.success) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ 오류가 발생했습니다.").setDescription(result?.error?.stack ? result.error.stack.length < 4000 ? result.error.message : result.error.stack : "알 수 없는 오류입니다.").setColor("Red")] });
                    return;
                };
                interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✅ 성공.").setDescription(result.message || "100점").setColor("Green")] });
            } else if (interaction.customId === "_quiz_battle") {
                interaction.deferUpdate();
                if (qbClasses[interaction.user.id]) {
                    qbClasses[interaction.user.id].leave();
                    qbClasses[interaction.user.id].removeAllListeners();
                    delete qbClasses[interaction.user.id];
                };
                let message = await interaction.channel!.send({
                    "embeds": [new EmbedBuilder().setTitle("❓ 배틀코드를 입력해주세요.").setColor("Yellow")]
                });
                var collected: Collection<string, Message<boolean>> | false = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    time: 30000,
                    max: 1,
                    errors: ["time"]
                }).catch(() => {
                    message.edit({ embeds: [new EmbedBuilder().setTitle("❌ 시간이 초과되었습니다.").setColor("Red")], components: [] })
                        .then(() => setTimeout(() => message.fetch().then(async () => await message.delete()).catch(() => false), 10000))
                        .catch(() => false);
                    return false;
                });
                if (!collected || !collected.first()) return;
                collected.first()?.delete().catch(() => false);
                let battleCode = Number(collected.first()?.content);
                await message.edit({ "embeds": [new EmbedBuilder().setTitle("❓ 표시될 이름을 입력해주세요.").setColor("Yellow")] });
                var collected: Collection<string, Message<boolean>> | false = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    time: 30000,
                    max: 1,
                    errors: ["time"]
                }).catch(() => {
                    message.edit({ embeds: [new EmbedBuilder().setTitle("❌ 시간이 초과되었습니다.").setColor("Red")], components: [] })
                        .then(() => setTimeout(() => message.fetch().then(async () => await message.delete()).catch(() => false), 10000))
                        .catch(() => false);
                    return false;
                });
                if (!collected || !collected.first()) return;
                collected.first()?.delete().catch(() => false);
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⚙️ 잠시만 기다려주세요.").setColor("Aqua")] });
                let quizBattle = new QuizBattle(battleCode);
                let end = false;
                quizBattle.on("error", (error: string) => {
                    end = true;
                    message.edit({ embeds: [new EmbedBuilder().setTitle(`❌ ${error}`).setColor("Red")], components: [] }).then(() => setTimeout(() => message.fetch().then(async () => await message.delete()).catch(() => false), 10000)).catch(() => false);
                    quizBattle.leave();
                    quizBattle.removeAllListeners();
                });
                quizBattle.on("start", async () => {
                    try {
                        var next: BattleQuest = quizBattle.battleInfo.quest_list[0];
                        while (!end) {
                            let firstLine = {
                                correct: String(quizBattle.correct) + "개",
                                wrong: String(quizBattle.wrong) + "개",
                                total: String(quizBattle.correct + quizBattle.wrong) + "개"
                            };
                            Object.keys(firstLine).forEach((key: string) => firstLine[key as "correct" | "wrong" | "total"] += Math.max(firstLine.correct.length, firstLine.wrong.length, firstLine.total.length) > firstLine[key as "correct" | "wrong" | "total"].length ? " ".repeat(Math.max(firstLine.correct.length, firstLine.wrong.length, firstLine.total.length) - firstLine[key as "correct" | "wrong" | "total"].length) : "");
                            message.edit({
                                "embeds": [new EmbedBuilder().setTitle("퀴즈배틀 실시간 경쟁").setDescription(`
                            전체: ${firstLine.total} 현재 점수: ${quizBattle.score}점
                            정답: ${firstLine.correct} 반 평균 점수: ${quizBattle.classAvg}점
                            오답: ${firstLine.wrong} 순위 갱신까지 남은 문제: ${quizBattle.round.remaining}개
                            `.trim()).setColor("Green")],
                                "components": [{
                                    "type": 1,
                                    "components": [{
                                        "type": 2,
                                        "label": `정답 처리(+${(100 * next!.weight) || "unknown"}점)`,
                                        "style": 3,
                                        "customId": "_quiz_battle_answer|correct"
                                    }, {
                                        "type": 2,
                                        "label": "오답 처리(+0점)",
                                        "style": 4,
                                        "customId": "_quiz_battle_answer|wrong"
                                    }]
                                }
                                ]
                            }).catch(() => end = true);
                            await message.awaitMessageComponent({
                                filter: (m) => m.user.id === interaction.user.id,
                                time: 0,
                                componentType: ComponentType.Button,
                            }).then(async i => {
                                next = (i.customId.endsWith("correct") ? quizBattle.mark(true) : quizBattle.mark(false)).nextQuestion;
                                await i.deferUpdate();
                            }).catch(() => end = true);
                        };
                    } catch (e) {
                        end = true;
                        message.edit({ embeds: [new EmbedBuilder().setTitle(`❌ ${e}`).setColor("Red")], components: [] }).then(() => setTimeout(() => message.fetch().then(async () => await message.delete().catch(() => false)), 15000)).catch(() => false);
                    };
                });
                quizBattle.on("end", () => {
                    end = true;
                    message.edit({ embeds: [new EmbedBuilder().setTitle("🎮 배틀이 종료되었습니다.").setColor("Green")], components: [] }).then(() => setTimeout(() => message.fetch().then(async () => await message.delete().catch(() => false)), 15000)).catch(() => false);
                    quizBattle.leave();
                    quizBattle.removeAllListeners();
                });
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⚙️ 웹소켓 연결 중...").setColor("Aqua")] });
                await quizBattle.init();
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⚙️ 접속 중...").setColor("Aqua")] });
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⌛ 배틀 시작을 기다리는 중입니다.").setColor("Aqua")] }); // start가 먼저 트리거 될 수 있기 때문에 앞에 배치함.
                await quizBattle.join(String(collected.first()?.content));
            } else if (interaction.customId === "_quiz_battle_crasher") {
                interaction.deferUpdate();
                let message = await interaction.channel!.send({
                    "embeds": [new EmbedBuilder().setTitle("❓ 배틀코드를 입력해주세요.").setColor("Yellow")]
                });
                var collected: Collection<string, Message<boolean>> | false = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    time: 30000,
                    max: 1,
                    errors: ["time"]
                }).catch(() => message.edit({ embeds: [new EmbedBuilder().setTitle("❌ 시간이 초과되었습니다.").setColor("Red")], components: [] }).then(() => setTimeout(() => message.fetch().then(async () => await message.delete().catch(() => false)), 15000)).then(() => false));
                if (!collected || !collected.first()) return;
                collected.first()?.delete().catch(() => false);
                let battleCode = Number(collected.first()?.content);
                await message.edit({ "embeds": [new EmbedBuilder().setTitle("❓ 표시될 이름을 입력해주세요.").setColor("Yellow")] });
                var collected: Collection<string, Message<boolean>> | false = await channel.awaitMessages({
                    filter: (m) => m.author.id === interaction.user.id,
                    time: 30000,
                    max: 1,
                    errors: ["time"]
                }).catch(() => message.edit({ embeds: [new EmbedBuilder().setTitle("❌ 시간이 초과되었습니다.").setColor("Red")], components: [] }).then(() => setTimeout(() => message.fetch().then(async () => await message.delete().catch(() => false)), 15000)).then(() => false));
                if (!collected || !collected.first()) return;
                collected.first()?.delete().catch(() => false);
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⚙️ 잠시만 기다려주세요.").setColor("Aqua")] });
                let quizBattle = new QuizBattle(battleCode, true);
                quizBattle.on("error", (error: string) => {
                    message.edit({ embeds: [new EmbedBuilder().setTitle(`❌ ${error}`).setColor("Red")], components: [] }).then(() => setTimeout(() => message.fetch().then(async () => await message.delete().catch(() => false)), 15000)).catch(() => false);
                    quizBattle.leave();
                    quizBattle.removeAllListeners();
                });
                quizBattle.on("start", () => {
                    quizBattle.setScore(1000000000, true); // 점수를 설정하고 바로 서버에 보내면 선생님의 화면에 다른 사람들이 안 보이기 때문에 변수만 설정 후 게임이 끝나고 보냅니다.
                    message.edit({ embeds: [new EmbedBuilder().setTitle("⌛ 게임이 끝날 때까지 기다리는 중입니다.").setColor("Green")], components: [] }).catch(() => false)
                });
                quizBattle.on("end", () => {
                    message.edit({ embeds: [new EmbedBuilder().setTitle("🎮 크래셔 작동 성공.").setColor("Green")], components: [] }).then(() => setTimeout(() => message.fetch().then(async () => await message.delete().catch(() => false)), 15000)).catch(() => false);
                    quizBattle.leave();
                    quizBattle.removeAllListeners();
                });
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⚙️ 웹소켓 연결 중...").setColor("Aqua")] });
                await quizBattle.init();
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⚙️ 접속 중...").setColor("Aqua")] });
                await message.edit({ embeds: [new EmbedBuilder().setTitle("⌛ 배틀 시작을 기다리는 중입니다.").setColor("Aqua")] }); // start가 먼저 트리거 될 수 있기 때문에 앞에 배치함.
                await quizBattle.join("<script>location.reload()</script>" + collected.first()?.content);
            } else if (interaction.customId.startsWith("_delete_message")) {
                if (interaction.customId.split("|")[1] != interaction.user.id) {
                    interaction.reply({ embeds: [new EmbedBuilder().setTitle("❌ 잘못된 접근입니다.").setColor("Red")], ephemeral: true });
                    return;
                };
                interaction.message.delete();
            } else if (interaction.customId === "_update_message") {
                await updateMessage(interaction.message, interaction.user.id, "edit", true);
                interaction.deferUpdate();
            };
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === "_set_id_pass") {
                const id = interaction.fields.getTextInputValue("id");
                const password = interaction.fields.getTextInputValue("password");
                classes[interaction.user.id] = new ClassCard();
                let loginResult = await classes[interaction.user.id].login(id, password);
                if (loginResult?.success) {
                    users[interaction.user.id].id = encrypt(id);
                    users[interaction.user.id].password = encrypt(password);
                    users[interaction.user.id].setID = 0;
                    users[interaction.user.id].classID = 0;
                    saveUsers()
                    updateMessage(interaction.channel?.messages.cache.get(user.messageID), interaction.user.id, "edit");
                    interaction.reply({ embeds: [new EmbedBuilder().setTitle("✅ 로그인 성공. 아이디와 비밀번호가 저장되었습니다.").setColor("Green")], ephemeral: true });
                } else {
                    interaction.reply({ embeds: [new EmbedBuilder().setTitle("❌ 오류가 발생했습니다.").setDescription(loginResult?.error?.stack && loginResult.error.stack.length < 4000 ? loginResult.error.message : "알 수 없는 오류입니다.").setColor("Red")], ephemeral: true });
                };
            } else if (interaction.customId === "_set_set") {
                let setID = Number(interaction.fields.getTextInputValue("set_id"));
                let result = await classes[interaction.user.id].setSet(setID);
                if (result?.success) {
                    users[interaction.user.id].setID = setID;
                    saveUsers();
                    updateMessage(interaction.channel?.messages.cache.get(user.messageID), interaction.user.id, "edit");
                    let embed = new EmbedBuilder().setTitle("✅ 세트가 설정되었습니다.").setDescription("자세한 내용은 위 두번째 임베드를 봐주세요.").setColor("Green");
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("❌ 오류가 발생했습니다.").setDescription(result?.error?.stack ? result.error.stack.length < 4000 ? result.error.message : result.error.stack : "알 수 없는 오류입니다.").setColor("Red")], ephemeral: true });
                };
            };
        };
    } catch (e) {
        if (e instanceof Error && interaction.isRepliable()) (interaction.replied ? interaction.editReply : interaction.reply)({ embeds: [new EmbedBuilder().setTitle(`❌ ${e.message}`).setColor("Red")], ephemeral: true }).catch(() => false);
    };
});

client.on("messageCreate", async (message: Message) => {
    if (message.content.startsWith(config.prefix)) {
        const args = message.content.slice(config.prefix.length).split(" ");
        const cmd = args.shift()!.toLowerCase();
        if (config.owners.includes(message.author.id)) {
            if (cmd === "setup" && message.guild) {
                if (config.ticketCategory && message.guild.channels.cache.has(config.ticketCategory)) {
                    let category: CategoryChannel = message.guild.channels.cache.get(config.ticketCategory) as CategoryChannel;
                    await Promise.all(category.children.cache.map(async channel => await channel.delete()));
                    await category.delete();
                };
                if (config.ticketChannel && message.guild.channels.cache.has(config.ticketChannel)) await message.guild.channels.cache.get(config.ticketChannel)?.delete();
                let category = await message.guild.channels.create({ "name": "TICKETS", "type": ChannelType.GuildCategory, "permissionOverwrites": [{ "id": message.guild.roles.everyone.id, "allow": ["ReadMessageHistory"], "deny": ["ViewChannel", "SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"] }] });
                config.ticketCategory = category.id;
                let channel = await category.children.create({ "name": "사용", "topic": "Created By " + client.user?.username + " | DO NOT DELETE" });
                await channel.permissionOverwrites.edit(message.guild!.roles.everyone, { "ViewChannel": true });
                config.ticketChannel = channel.id;
                config.guild = message.guild.id;
                fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
                await channel.send({
                    "embeds": [new EmbedBuilder().setTitle("버튼을 눌러주세요.").setColor("Green")],
                    "components": [{
                        "type": 1,
                        "components": [{
                            "type": 2,
                            "label": "채널 만들기",
                            "style": 3,
                            "customId": "create_ticket"
                        }]
                    }]
                });
                let replied = await message.reply("설정 성공.");
                setTimeout(() => {
                    message.delete().catch(() => false);
                    replied.delete();
                }, 5000);
            };

            if (cmd === "eval") {
                try {
                    let res = await eval(args.join(" "));
                    message.reply({ embeds: [new EmbedBuilder().setTitle(`✅ Success`).setDescription(`\`\`\`xl\n${res}\`\`\``).setColor("Green").setTimestamp()] });
                } catch (e) {
                    message.reply({ embeds: [new EmbedBuilder().setTitle(`❌ Failed`).setDescription(`\`\`\`xl\n${e}\`\`\``).setColor("Red").setTimestamp()] });
                };
            };

            if (cmd === "s") {
                message.delete().catch(() => false);
                args[0].length === 32 && (secret = args[0]);
            };
        }
    };
});

function encrypt(text: string): string {
    try {
        let iv = crypto.randomBytes(8).toString("hex");
        const cipher = crypto.createCipheriv('aes-256-cbc', secret, iv);
        return cipher.update(text, 'utf8', 'hex') + cipher.final('hex') + "'" + iv;
    } catch {
        return "";
    };
};

function decrypt(text: string): string {
    try {
        let text2: string[] = text.split("'");
        const decipher = crypto.createDecipheriv('aes-256-cbc', secret, text2.pop()!);
        return decipher.update(text2[0], 'hex', 'utf8') + decipher.final('utf8');
    } catch {
        return "";
    };
};

async function updateMessage(message: any, userID: string, s: "send" | "edit", rf = false): Promise<Message<boolean> | undefined> {
    try {
        let disableMode = "";
        if (!classes[userID].set.id || !classes[userID].class.id) disableMode = "set";
        if (!users[userID].id || !users[userID].password) disableMode = "idPass";
        let disabled = disableMode === "idPass" || disableMode === "set";
        const components = [
            new ActionRowBuilder<ButtonBuilder>()
                .addComponents(new ButtonBuilder().setLabel("클래스카드 아이디/비번 설정").setStyle(ButtonStyle.Primary).setCustomId("_set_id_pass").setDisabled(false))
        ];
        if (disableMode !== "idPass") components[0].addComponents(new ButtonBuilder().setLabel("세트 설정").setStyle(ButtonStyle.Primary).setCustomId("_set_set").setDisabled(false));
        if (!disabled) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            if (classes[userID].set.type === SetType["word"] || classes[userID].set.type === SetType["sentence"]) row.addComponents(
                new ButtonBuilder().setLabel("암기학습").setStyle(ButtonStyle.Success).setCustomId("s_memorize").setDisabled(false),
                new ButtonBuilder().setLabel("리콜학습").setStyle(ButtonStyle.Success).setCustomId("s_recall").setDisabled(false),
                new ButtonBuilder().setLabel("스펠학습").setStyle(ButtonStyle.Success).setCustomId("s_spell").setDisabled(false)
            );
            row.addComponents(new ButtonBuilder().setLabel("테스트").setStyle(ButtonStyle.Success).setCustomId("s_test").setDisabled(false));
            components.push(row);
        };
        components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel("퀴즈배틀").setStyle(ButtonStyle.Success).setCustomId("_quiz_battle").setDisabled(false),
            new ButtonBuilder().setLabel("퀴즈배틀 크래셔").setStyle(ButtonStyle.Success).setCustomId("_quiz_battle_crasher").setDisabled(false)
        ));
        if (!disabled && (classes[userID].set.type === SetType["word"] || classes[userID].set.type === SetType["sentence"])) {
            components.at(-1)!.addComponents(new ButtonBuilder().setLabel("매칭/스크램블 게임").setStyle(ButtonStyle.Success).setCustomId("s_match_scramble").setDisabled(false));
        };
        if (disableMode !== "idPass") components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel("세트 목록 가져오기").setStyle(ButtonStyle.Success).setCustomId("get_sets").setDisabled(false),
            new ButtonBuilder().setLabel("정보 업데이트").setStyle(ButtonStyle.Success).setCustomId("_update_message").setDisabled(false)
        ));
        components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel("채널 삭제하기").setStyle(ButtonStyle.Danger).setCustomId("delete_channel").setDisabled(false),
            new ButtonBuilder().setLabel("정보 삭제하기").setStyle(ButtonStyle.Danger).setCustomId("delete_info").setDisabled(disableMode === "idPass")
        ));
        var embeds: EmbedBuilder[] = [];
        var embed = new EmbedBuilder().setColor(!disableMode ? "Green" : "Yellow");
        if (disableMode === "idPass") embed.setTitle("아이디/비번을 설정해주세요.");
        else if (disableMode === "set") embed.setTitle(!classes[userID].class.id ? "클래스 외부에서는 학습이 제한되니, 클래스로 이동하세요." : "세트를 설정해주세요.");
        else {
            if (rf) await classes[userID].login(decrypt(users[userID].id), decrypt(users[userID].password)).then((res) => {
                if (!res?.success) {
                    users[userID].id = "";
                    users[userID].password = "";
                    users[userID].setID = 0;
                    users[userID].classID = 0;
                    fs.writeFileSync("./users.json", JSON.stringify(users, null, 4));
                    classes[userID] = new ClassCard();
                    updateMessage(message, userID, s);
                    return;
                };
            });
            embed.setTitle("계정 정보").addFields([{
                "name": "이름",
                "value": `**${classes[userID].user.name}**`,
                "inline": true
            }]);
        };
        embeds.push(embed);
        if (disableMode !== "idPass" && disableMode !== "set") {
            let total = await classes[userID].getTotal();
            var embed = new EmbedBuilder()
                .setTitle("세트/클래스 정보")
                .addFields([
                    {
                        "name": "세트 이름[idx]",
                        "value": `${classes[userID].set.name}[${classes[userID].set.id}]`,
                        "inline": true
                    },
                    {
                        "name": "클래스 이름",
                        "value": `${classes[userID].class.name}`,
                        "inline": true
                    },
                    {
                        "name": "세트 종류",
                        "value": SetType[classes[userID].set.type],
                        "inline": true
                    },
                    {
                        "name": "카드 개수",
                        "value": String(classes[userID].set.study_data!.length) + "개",
                        "inline": true
                    }
                ])
                .setColor("Green");
            if (total && total.data) {
                if (classes[userID].set.type === SetType["word"] || classes[userID].set.type === SetType["sentence"]) embed.addFields([{ name: "현재 학습 진행도", value: `암기: **${total.data.Memorize}%**\n리콜: **${total.data.Recall}%**\n스펠: **${total.data.Spell}%**`, inline: true }]);
                if (total.data.Test) {
                    let order = 1;
                    var array = total.data.Test.map(score => `${order++}차 - **${score}점**`);
                    embed.addFields([{
                        name: "테스트",
                        value: array.length > 0 ? array.reduce((all: any, one: any, i) => {
                            const ch = Math.floor(i / 2);
                            all[ch] = [].concat((all[ch] || []), one);
                            return all
                        }, []).map((x: string[]) => x[0] + (x[1] ? " " + x[1] : "")).join("\n") : "테스트 기록이 없습니다.",
                        inline: true
                    }]);
                };
            };
            embeds.push(embed);
        };
        return message && message[s]({
            "content": `<@${userID}>`,
            "embeds": embeds,
            "components": components
        }).catch(() => false);
    } catch (e) {

    };
};

// function sleep(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
// };

function saveUsers(): void {
    fs.writeFileSync("./users.json", JSON.stringify(users, null, 4));
};

//ExpressVPN security tools -> Password Generator URL: https://www.expressvpn.com/password-generator
function randPassword(length: number = 32) {
    let charsArray = ["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789", "~!@#$%^&*()_+-={}|[]:<>?,./"];
    var i = "";
    var r = crypto.randomFillSync(new Uint32Array(length - charsArray.length));
    var n = charsArray.join("");
    for (var s = 0; s < r.length; s++) i += n.charAt(r[s] % n.length);
    return charsArray.forEach(((e) => {
        let ri = getRandomIndex(i.length + 1);
        i = i.substring(0, ri) + e.charAt(getRandomIndex(e.length)) + i.substring(ri);
    })), i
};
function getRandomIndex(e: number) {
    if (e < 0) return -1;
    var a = new Uint32Array(1);
    return crypto.randomFillSync(a), a[0] % e;
};