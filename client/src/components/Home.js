import React, { useCallback, useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { useHistory } from 'react-router-dom';
import { Grid, CssBaseline, Button } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

import { SidebarContainer } from '../components/Sidebar';
import { ActiveChat } from '../components/ActiveChat';
import { SocketContext } from '../context/socket';

const useStyles = makeStyles((theme) => ({
  root: {
    height: '100vh',
  },
}));

const Home = ({ user, logout }) => {
  const history = useHistory();

  const socket = useContext(SocketContext);

  const [unprocessedConvos, setUnprocessedConvos] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);

  const classes = useStyles();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const addSearchedUsers = (users) => {
    const currentUsers = {};

    // make table of current users so we can lookup faster
    conversations.forEach((convo) => {
      currentUsers[convo.otherUser.id] = true;
    });

    const newState = [...conversations];
    users.forEach((user) => {
      // only create a fake convo if we don't already have a convo with this user
      if (!currentUsers[user.id]) {
        let fakeConvo = { otherUser: user, messages: [], unreadCount: 0 };
        newState.push(fakeConvo);
      }
    });

    // There's no wasRead data so we can use setConversations here.
    setConversations(newState);
  };

  const clearSearchedUsers = () => {
    setConversations((prev) => prev.filter((convo) => convo.id));
  };

  const saveMessage = async (body) => {
    const { data } = await axios.post('/api/messages', body);
    return data;
  };

  const saveWasRead = useCallback(async (otherUsersName, messageId) => {
    console.log('saveWasRead');
    const { data } = await axios.patch(`/api/messages/${messageId}`, {
      otherUsersName,
      attributes: {
        wasRead: true
      }
    });
    return data;
  }, []);

  const sendMessage = (data, body) => {
    socket.emit('new-message', {
      message: data.message,
      recipientId: body.recipientId,
      sender: data.sender,
    });
  };

  const postMessage = async (body) => {
    try {
      const data = await saveMessage(body);

      if (!body.conversationId) {
        addNewConvo(body.recipientId, data.message);
      } else {
        addMessageToConversation(data);
      }

      sendMessage(data, body);
    } catch (error) {
      console.error(error);
    }
  };

  /**
   * Updates the isLatestRead properties on a single users messages and counts
   * how many unread messages there are.
   */
  const processWasRead = useCallback((messages) => {
    let unreadCount = messages.length;
    for(let i = 0; i < messages.length; i++) {
      if(messages[i].wasRead) {
        unreadCount--;
        if (i + 1 === messages.length || !messages[i + 1].wasRead) {
          messages[i].isLatestRead = true;
          break;
        } else {
          // clear any previously set isLatestRead values
          messages[i].isLatestRead = false;
        }
      }
    }
    return unreadCount;
  }, []);

  const setAllToRead = useCallback((messages, otherUsersName) => {
    messages.forEach((message, i) => {
      if(!message.wasRead) {
        saveWasRead(otherUsersName, message.id);
        message.wasRead = true;
      }
      if(i === message.length - 1) {
        message.isLatestRead = true;
      } else {
        // clear any isLatestRead values that were previously set
        message.isLatestRead = false;
      }
    })
  }, [saveWasRead]);

  /**
   * Handles everything related to read status data. It will calculate unread counts,
   * set a 'isLatestRead: true' property on the appropriate messages, and updates wasRead
   * on the backend if needed.
   */
  const wasReadHelper = useCallback((convos) => {
    if(!user?.id) return;

    return convos.map(convo => {
      const messages = convo.messages;
      const othersMessages = [];
      const usersMessages = [];
      messages.forEach(message => {
        if(message.senderId === user.id) {
          usersMessages.push(message);
        } else {
          othersMessages.push(message);
        }
      });
      if(convo.otherUser.username === activeConversation) {
        setAllToRead(othersMessages, activeConversation);
        convo.unreadCount = 0;
      } else {
        convo.unreadCount = processWasRead(othersMessages);
      }
      processWasRead(usersMessages);
      return convo;
    });
  }, [activeConversation, setAllToRead, processWasRead, user?.id]);;

  const addNewConvo = useCallback(
    (recipientId, message) => {
      setUnprocessedConvos((prevConvos) =>
        prevConvos.map((convo) => {
          if (convo.otherUser.id === recipientId) {
            return {
              ...convo,
              messages: [...convo.messages, message],
              latestMessageText: message.text,
              id: message.conversationId
            }
          }
          return convo;
        })
      );
    },
    []
  );

  const addMessageToConversation = useCallback(
    (data) => {
      console.log('addMessageToConversation');
      // if sender isn't null, that means the message needs to be put in a brand new convo
      const { message, sender = null } = data;
      if (sender !== null) {
        const newConvo = {
          id: message.conversationId,
          otherUser: sender,
          messages: [message],
        };
        newConvo.latestMessage = message;
        setUnprocessedConvos((prev) => [newConvo, ...prev]);
      }

      setUnprocessedConvos((prevConvos) =>
        prevConvos.map((convo) => {
          if (convo.id === message.conversationId) {
            return {
              ...convo,
              messages: [...convo.messages, message],
              latestMessage: message
            }
          }
          return convo;
        })
      );
    },
    []
  );

  const setActiveChat = (username) => {
    setActiveConversation(username);
  };

  const addOnlineUser = useCallback((id) => {
    setUnprocessedConvos((prev) =>
      prev.map((convo) => {
        if (convo.otherUser.id === id) {
          const convoCopy = { ...convo };
          convoCopy.otherUser = { ...convoCopy.otherUser, online: true };
          return convoCopy;
        } else {
          return convo;
        }
      })
    );
  }, []);

  const removeOfflineUser = useCallback((id) => {
    setUnprocessedConvos((prev) =>
      prev.map((convo) => {
        if (convo.otherUser.id === id) {
          const convoCopy = { ...convo };
          convoCopy.otherUser = { ...convoCopy.otherUser, online: false };
          return convoCopy;
        } else {
          return convo;
        }
      })
    );
  }, []);

  const setWasReadLocally = useCallback(({ conversationId, messageId }) => {
    console.log('setWasReadLocally');
    setUnprocessedConvos(prev => prev.map(convo => {
      if (convo.id === conversationId) {
        const convoCopy = { ...convo };
        convoCopy.messages = convoCopy.messages.map(message => {
          if(String(message.id) === String(messageId)) {
            return {
              ...message,
              wasRead: true
            }
          }
          return message
        });
        return convoCopy;
      }
      return convo;
    }));
  }, []);

  // Lifecycle

  useEffect(() => {
    // Socket init
    socket.on('add-online-user', addOnlineUser);
    socket.on('remove-offline-user', removeOfflineUser);
    socket.on('new-message', addMessageToConversation);
    socket.on('was-read', setWasReadLocally);

    return () => {
      // before the component is destroyed
      // unbind all event handlers used in this component
      socket.off('add-online-user', addOnlineUser);
      socket.off('remove-offline-user', removeOfflineUser);
      socket.off('new-message', addMessageToConversation);
      socket.off('was-read', setWasReadLocally);
    };
  }, [addMessageToConversation, addOnlineUser, removeOfflineUser, setWasReadLocally, socket]);

  useEffect(() => {
    // when fetching, prevent redirect
    if (user?.isFetching) return;

    if (user && user.id) {
      setIsLoggedIn(true);
    } else {
      // If we were previously logged in, redirect to login instead of register
      if (isLoggedIn) history.push('/login');
      else history.push('/register');
    }
  }, [user, history, isLoggedIn]);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const { data } = await axios.get('/api/conversations');
        setUnprocessedConvos(data);
      } catch (error) {
        console.error(error);
      }
    };
    if (!user.isFetching) {
      fetchConversations();
    }
  // adding updateConversations as a dependency caused extraneous fetches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Update read status when the user switches conversations or new conversation state needs to be
  // processed
  useEffect(() => {
    setConversations(wasReadHelper(unprocessedConvos));
  }, [activeConversation, unprocessedConvos, wasReadHelper]);
 
  const handleLogout = async () => {
    if (user && user.id) {
      await logout(user.id);
    }
  };

  return (
    <>
      <Button onClick={handleLogout}>Logout</Button>
      <Grid container component="main" className={classes.root}>
        <CssBaseline />
        <SidebarContainer
          conversations={conversations}
          user={user}
          clearSearchedUsers={clearSearchedUsers}
          addSearchedUsers={addSearchedUsers}
          activeChat={activeConversation}
          setActiveChat={setActiveChat}
        />
        <ActiveChat
          activeConversation={activeConversation}
          conversations={conversations}
          user={user}
          postMessage={postMessage}
        />
      </Grid>
    </>
  );
};

export default Home;
