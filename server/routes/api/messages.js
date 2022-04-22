const router = require("express").Router();
const { Conversation, Message, User } = require("../../db/models");
const onlineUsers = require("../../onlineUsers");

// expects {recipientId, text, conversationId } in body (conversationId will be null if no conversation exists yet)
router.post("/", async (req, res, next) => {
  try {
    if (!req.user) {
      return res.sendStatus(401);
    }
    const senderId = req.user.id;
    const { recipientId, text, conversationId, sender } = req.body;

    // if we already know conversation id, we can save time and just add it to message and return
    if (conversationId) {
      const message = await Message.create({ senderId, text, conversationId });
      return res.json({ message, sender });
    }
    // if we don't have conversation id, find a conversation to make sure it doesn't already exist
    let conversation = await Conversation.findConversation(
      senderId,
      recipientId
    );

    if (!conversation) {
      // create conversation
      conversation = await Conversation.create({
        user1Id: senderId,
        user2Id: recipientId,
      });
      if (onlineUsers.isUserOnline(sender.id)) {
        sender.online = true;
      }
    }
    const message = await Message.create({
      senderId,
      text,
      conversationId: conversation.id,
    });

    res.json({ message, sender });
  } catch (error) {
    next(error);
  }
});

const validPatchAttributesJSON = JSON.stringify({
  wasRead: true
});

router.patch('/:messageId', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.sendStatus(401);
    }
    const userId = req.user.id;
    const { messageId } = req.params;
    const { otherUsersName, attributes } = req.body;

    const otherUser = await User.findOne({ where: { username: otherUsersName }});
    if(!otherUser) {
      return res.status(404).json({
        message: 'Other user not found.'
      });
    }

    const conversation = await Conversation.findConversation(
      userId,
      otherUser.id
    );
    if(!conversation?.id) {
      return res.status(404).json({
        message: 'Conversation for this message not found.'
      });
    }

    const message = await Message.findOne({
      where: {
        id: messageId
      }
    });
    if(!message?.id) {
      return res.status(404).json({
        message: 'Message not found.'
      });
    }
    if(JSON.stringify(attributes) !== validPatchAttributesJSON) {
      return res.status(409).json({
        message: 'Messages may only be PATCHed to set wasRead to true.'
      });
    }
    if(message.senderId === userId) {
      return res.status(401).json({
        message: 'Users may only update wasRead on messages sent by others.'
      });
    }
    
    message.wasRead = true;
    await message.save();

    
    if(onlineUsers.isUserOnline(otherUser.id)) {
      const socket = onlineUsers.getSocketById(otherUser.id);
      onlineUsers.emitEventToUser(otherUser.id, "was-read", {
        conversationId: conversation.id,
        messageId: messageId
      });
    }

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
