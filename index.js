'use strict';

require('dotenv').config()

// Imports dependencies and set up http server
const
  express = require('express'),
  https = require('https'),
  fs = require('fs'),
  app = express(),
  server = https.createServer({
        key: fs.readFileSync(process.env.SSL_KEY),
        cert: fs.readFileSync(process.env.SSL_CERT)
  }, app).listen(process.env.PORT || 1337, () => console.log('webhook is listening')),

  SLACK_CHANNEL = process.env.SLACK_CHANNEL,
  { createEventAdapter } = require('@slack/events-api'),
  { WebClient } = require('@slack/client'),
  slackWeb = new WebClient(process.env.SLACK_TOKEN),
  slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET),
  MessengerPlatform = require('facebook-bot-messenger'),

  download = require('url-download'),
  slackUsers = {},
  botID = process.env.SLACK_BOT_ID,
  bot = MessengerPlatform.create({
    pageID: process.env.FB_PAGE_ID,
    appID: process.env.FB_APP_ID,
    appSecret: process.env.FB_APP_SECRET,
    validationToken: process.env.FB_VALIDATION_TOKEN,
    pageToken: process.env.PAGE_ACCESS_TOKEN
  }, server);

slackUsers[process.env.SLACK_USER_ID] = process.env.SLACK_USER_NAME;
let psid = null
console.log('Slack Channel: ' + SLACK_CHANNEL);

// Creates the endpoint for our Slack webhook
app.use('/slackhook', slackEvents.expressMiddleware());

slackEvents.on('message', (event) => {
  if (event.user != botID && (!event.subtype || event.subtype != 'bot_message')) {
    console.log(event);
    if (!event.files) {
      let response = `${slackUsers[event.user]}: ${event.text}`

      bot.sendTextMessage(psid, response)
    } else {
      if (event.text != '') {
        let response = `${slackUsers[event.user]}: ${event.text}`
        bot.sendTextMessage(psid, response)
      }
      event.files.forEach((file) => {
        slackWeb.files.sharedPublicURL({
          token: process.env.SLACK_ACCESS_TOKEN,
          file: file.id
        }).then((res) => {
          console.log('Shared Public URL...');
          let pub_tok = res.file.permalink_public.split('-').pop()
          let url = res.file.url_private_download+'?pub_secret='+pub_tok
          bot.sendFileMessage(psid, url, false)
        }).catch(console.error);
      });
    }
  }
});

slackEvents.on('error', console.error);

app.use(bot.webhook('/webhook'));
bot.on(MessengerPlatform.Events.MESSAGE, function(userId, message) {
  console.log('Setting new PSID: ' + userId);
  psid = userId;
  handleMessage(psid, message);
});

app.get('/terms', (req, res) => {
  res.sendStatus(200);
});

// Handles messages events
function handleMessage(sender_psid, received_message) {
  let response;
  console.log(received_message);
  // Check if the message contains text
  if (!received_message.hasAttachments()) {    

    // Create the payload for a basic text message
    response = {
      "text": received_message.getText(),
      "channel": SLACK_CHANNEL
    }
    console.log(response);
    // Sends the response message
    slackWeb.chat.postMessage(response)
    .then((res) => {
      // `res` contains information about the posted message
      console.log('Message sent: ', res.ts);
    })
    .catch(console.error);
  } else {
    console.log('Attachments:')
    received_message.getAttachments().forEach(attachment => {
      console.log(attachment);
      console.log(attachment.getType());
      console.log(attachment.getContent());
      download(attachment.getContent(), './').on('close', (err,url,dst) => {
        console.log('File downloaded to: ' + dst);
        slackWeb.files.upload({
          file: fs.createReadStream('./'+dst),
          channels: SLACK_CHANNEL
        }).then((res) => {
          console.log('File uploaded: ' + res.file.id);
          fs.unlinkSync('./'+dst);
        });
      });
    });
  }
}
