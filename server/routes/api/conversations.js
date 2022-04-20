const router = require("express").Router();
const { User, Conversation, Message } = require("../../db/models");
const { Op } = require("sequelize");
const onlineUsers = require("../../onlineUsers");
const { io } = require("../../bin/www");

// get all conversations for a user, include latest message text for preview, and all messages
// include other user model so we have info on username/profile pic (don't include current user info)
router.get("/", async (req, res, next) => {
  try {
    if (!req.user) {
      return res.sendStatus(401);
    }
    const userId = req.user.id;
    const conversations = await Conversation.findAll({
      where: {
        [Op.or]: {
          user1Id: userId,
          user2Id: userId,
        },
      },
      attributes: ["id", "user1LastReadMessageId", "user2LastReadMessageId"],
      order: [[Message, "createdAt", "ASC"]],
      include: [
        { model: Message, order: ["createdAt", "ASC"] },
        {
          model: User,
          as: "user1",
          where: {
            id: {
              [Op.not]: userId,
            },
          },
          attributes: ["id", "username", "photoUrl"],
          required: false,
        },
        {
          model: User,
          as: "user2",
          where: {
            id: {
              [Op.not]: userId,
            },
          },
          attributes: ["id", "username", "photoUrl"],
          required: false,
        },
      ],
    });

    for (let i = 0; i < conversations.length; i++) {
      const convo = conversations[i];
      const convoJSON = convo.toJSON();

      // change user1/user2 references to be user or otherUser
      // and fetch message data for LastReadMessages
      if (convoJSON.user1) {
        convoJSON.otherUser = convoJSON.user1;
        delete convoJSON.user1;

        if(convoJSON.user1LastReadMessageId) {
          convoJSON.otherUserLastReadMessage = await Message.findOne({
            where: { id: convoJSON.user1LastReadMessageId}
          });
        }
        if(convoJSON.user2LastReadMessageId) {
          convoJSON.usersLastReadMessage = await Message.findOne({
            where: { id: convoJSON.user2LastReadMessageId}
          });
        }
      } else if (convoJSON.user2) {
        convoJSON.otherUser = convoJSON.user2;
        delete convoJSON.user2;

        if(convoJSON.user1LastReadMessageId) {
          convoJSON.usersLastReadMessage = await Message.findOne({
            where: { id: convoJSON.user1LastReadMessageId}
          });
        }
        if(convoJSON.user2LastReadMessageId) {
          convoJSON.otherUserLastReadMessage = await Message.findOne({
            where: { id: convoJSON.user2LastReadMessageId}
          });
        }
      }
      delete convoJSON.user1LastReadMessageId;
      delete convoJSON.user2LastReadMessageId;

      // set property for online status of the other user
      if (onlineUsers.isUserOnline(convoJSON.otherUser.id)) {
        convoJSON.otherUser.online = true;
      } else {
        convoJSON.otherUser.online = false;
      }

      // set properties for notification count and latest message preview
      convoJSON.latestMessage = convoJSON.messages[convoJSON.messages.length - 1];
      conversations[i] = convoJSON;
    }

    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

router.put('/last-read', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.sendStatus(401);
    }
    const userId = req.user.id;
    const { messageId, otherUserName } = req.body;
    const { id: otherUserId } = await User.findOne({ where: { username: otherUserName }});
    const message = await Message.findOne({ where: { id: messageId }});

    if(!message) {
      throw new Error('Could not find message for the given messageId');
    }

    const conversation1 = await Conversation.findOne({
      where: {
        [Op.and]: {
          user1Id: userId,
          user2Id: otherUserId
        }
      },
      attributes: ["id", "user1LastReadMessageId", "user2LastReadMessageId"]
    });
    const conversation2 = await Conversation.findOne({
      where: {
        [Op.and]: {
          user1Id: otherUserId,
          user2Id: userId
        }
      }
    });

    let convoId;

    if(conversation1) {
      conversation1.user2LastReadMessageId = messageId;
      await conversation1.save();
      convoId = conversation1.id;
    } else if(conversation2) {
      conversation2.user1LastReadMessageId = messageId;
      await conversation2.save();
      convoId = conversation2.id;
    } else {
      throw new Error('Could not find the related conversation to update.')
    }

    if(convoId && onlineUsers.isUserOnline(otherUserId)) {
      const socket = onlineUsers.getSocketById(otherUserId);
      // Send an event only to the other user.
      io.to(socket.id).emit("last-read", {
        conversationId: convoId,
        otherUserLastRead: messageId
      });
    }
    res.json({ message: 'success' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
