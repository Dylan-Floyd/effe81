class UserIdSocketMap {
  map;
  io;

  constructor() {
    this.map = {};
  }

  setIo(io) {
    this.io = io;
  }

  getSocketById(id) {
    return this.map[''+id];
  }

  isUserOnline(id) {
    const res = Object.keys(this.map).includes(''+id);
    return res;
  }

  addUser(id, socket) {
    this.map[''+id] = socket;
  }

  removeUserById(id) {
    delete this.map[''+id]
  }

  emitEventToUser(id, eventName, eventData) {
    this.io.to(this.getSocketById(id).id).emit(eventName, eventData);
  }
}

const onlineUsers = new UserIdSocketMap();
module.exports = onlineUsers;
