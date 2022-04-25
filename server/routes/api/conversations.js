const router = require("express").Router();
const { Conversation, Message } = require("../../db/models");
const { QueryTypes } = require("sequelize");
const onlineUsers = require("../../onlineUsers");
const db = require("../../db/db");

// get all conversations for a user, include latest message text for preview, and all messages
// include other user model so we have info on username/profile pic (don't include current user info)
router.get("/", async (req, res, next) => {
  try {
    if (!req.user) {
      return res.sendStatus(401);
    }
    const userId = req.user.id;
    const conversations = await db.query(`
      SELECT conversations.id,
        jsonb_agg(to_jsonb(messages.*) ORDER BY messages."createdAt" ASC) AS messages,
        jsonb_agg(to_jsonb(messages.*) ORDER BY messages."createdAt" ASC)->-1 AS "latestMessage",
        jsonb_agg(to_jsonb(messages."createdAt") ORDER BY messages."createdAt" ASC)->-1 AS "latestMessageAt",
        count(messages) FILTER ( WHERE messages."wasRead" = FALSE AND messages."senderId" <> :userId )::int AS "unreadCount",
        (
          SELECT json_build_object(
            'id', users.id,
            'username', users.username,
            'photoUrl', users."photoUrl"
          )
          FROM users
          WHERE
            CASE WHEN conversations."user1Id" = :userId THEN conversations."user2Id" = users.id
                WHEN conversations."user2Id" = :userId THEN conversations."user1Id" = users.id
            END
        ) AS "otherUser"
      FROM conversations
      LEFT JOIN messages
      ON conversations.id = messages."conversationId"
      WHERE conversations."user1Id" = :userId OR conversations."user2Id" = :userId
      GROUP BY conversations.id
      ORDER BY "latestMessageAt" DESC
    `, {
      raw: true,
      type: QueryTypes.SELECT,
      replacements: { userId }
    });
    for (let i = 0; i < conversations.length; i++) {
      const convo = conversations[i];

      // start at the most recent message and search backwards
      // for the first message that was read by the other user
      for(let i = convo.messages.length - 1; i >= 0; i--) {
        const message = convo.messages[i];
        if(+userId === +message.senderId && message.wasRead) {
          convo.othersLatestReadMessage = message;
          break;
        }
      }

      // set property for online status of the other user
      if (onlineUsers.isUserOnline(convo.otherUser.id)) {
        convo.otherUser.online = true;
      } else {
        convo.otherUser.online = false;
      }
    }

    // put the most recent conversations at the start of the array
    conversations.sort((a, b) => {
      const aDate = new Date(a.messages[a.messages.length - 1].createdAt);
      const bDate = new Date(b.messages[b.messages.length - 1].createdAt);
      return bDate - aDate;
    });

    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

const validPatchAttributesJSON = JSON.stringify({
  unreadCount: 0
});

router.patch('/:conversationId', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.sendStatus(403);
    }
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { attributes } = req.body;

    if(JSON.stringify(attributes) !== validPatchAttributesJSON) {
      return res.status(409).json({
        message: 'conversations may only be PATCHed to set unreadCount to 0.'
      });
    }

    const conversation = await Conversation.findOne({
      where: {
        id: conversationId
      }
    });
    if(!conversation?.id) {
      return res.status(404).json({
        message: 'Conversation not found.'
      });
    }

    const otherUserId = conversation.user1Id === userId
      ? conversation.user2Id
      : conversation.user1Id;

    await Message.update({ wasRead: true }, {
      where: {
        conversationId,
        wasRead: false,
        senderId: otherUserId
      }
    });

    const newLatestReadMessage = await Message.findOne({
      where: {
        conversationId,
        senderId: otherUserId
      },
      order: [['createdAt', 'DESC']]
    });

    if(onlineUsers.isUserOnline(otherUserId)) {
      onlineUsers.emitEventToUser(otherUserId, "latest-read", {
        conversationId: conversation.id,
        message: newLatestReadMessage
      });
    }

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
