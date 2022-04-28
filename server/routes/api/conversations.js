const router = require("express").Router();
const { User, Conversation, Message } = require("../../db/models");
const { Op } = require("sequelize");
const onlineUsers = require("../../onlineUsers");

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
      attributes: ["id"],
      order: [[Message, "createdAt", "ASC"]],
      include: [
        { model: Message },
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
          required: false
        }
      ]
    });

    for (let i = 0; i < conversations.length; i++) {
      const convo = conversations[i];
      const convoJSON = convo.toJSON();

      // set a property "otherUser" so that frontend will have easier access
      if (convoJSON.user1) {
        convoJSON.otherUser = convoJSON.user1;
        delete convoJSON.user1;
      } else if (convoJSON.user2) {
        convoJSON.otherUser = convoJSON.user2;
        delete convoJSON.user2;
      }

      let unreadCount = 0;
      let foundOthersLatestRead = false;
      let foundUsersLatestRead = false;
      // start at the most recent message and search backwards
      // for the latest message that was read by the other user
      // and count the users unread messages
      for (let i = convo.messages.length - 1; i >= 0; i--) {
        const message = convo.messages[i];
        if (+userId === +message.senderId) {
          if (message.wasRead && !foundOthersLatestRead) {
            convo.othersLatestReadMessage = message;
            foundOthersLatestRead = true;
          }
        } else {
          // this message was sent by the other user
          if (!message.wasRead) {
            unreadCount++;
          } else {
            foundUsersLatestRead = true;
          }
        }
        // stop looping once we've found both messages of interest.
        if(foundOthersLatestRead && foundUsersLatestRead) break;
      }
      convoJSON.unreadCount = unreadCount;

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

router.patch('/:conversationId', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.sendStatus(401);
    }
    const userId = req.user.id;
    const { conversationId } = req.params;

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
