const Conversation = require("./conversation");
const User = require("./user");
const Message = require("./message");

// associations

User.hasMany(Conversation);
Conversation.belongsTo(User, { as: "user1" });
Conversation.belongsTo(User, { as: "user2" });
Message.belongsTo(Conversation);
Conversation.belongsTo(Message, {
  as: 'user1LastReadMessage',
  constraints: false
});
Conversation.belongsTo(Message, {
  as: 'user2LastReadMessage',
  constraints: false
});
Conversation.hasMany(Message);

module.exports = {
  User,
  Conversation,
  Message
};
