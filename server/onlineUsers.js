class UserIdSocketMap {
  map;
  
  constructor() {
    this.map = {};
  }

  getSocketById(id) {
    return this.map[id];
  }

  isUserOnline(id) {
    return Object.keys(this.map).includes(id);
  }

  addUser(id, socket) {
    this.map[id] = socket;
  }

  removeUserById(id) {
    delete this.map[id]
  }
}

const onlineUsers = new UserIdSocketMap();
module.exports = onlineUsers;
