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

  const saveConversationAsRead = useCallback(async (conversationId) => {
    const { data } = await axios.patch(`/api/conversations/${conversationId}`);
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

  const addNewConvo = useCallback(
    (recipientId, message) => {
      setConversations((prevConvos) =>
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
      // if sender isn't null, that means the message needs to be put in a brand new convo
      const { message, sender = null } = data;
      if (sender !== null) {
        const newConvo = {
          id: message.conversationId,
          otherUser: sender,
          messages: [message],
        };
        newConvo.latestMessage = message;
        newConvo.unreadCount = 1;
        setConversations((prev) => [newConvo, ...prev]);
      } else {
        setConversations((prevConvos) =>
          prevConvos.map((convo) => {
            if (convo.id === message.conversationId) {
              let unreadCount = convo.unreadCount;
              if(message.senderId !== user.id) {
                if(convo.otherUser.username === activeConversation) {
                  // If this request fails, it'll get sent again the next time the user gets the convos
                  // from the backend, so it doesn't need error handling or an await.
                  saveConversationAsRead(convo.id);
                } else {
                  unreadCount = convo.unreadCount + 1;
                }
              }
              return {
                ...convo,
                messages: [...convo.messages, message],
                latestMessage: message,
                unreadCount
              }
            }
            return convo;
          })
        );
      }
    },
    [activeConversation, user?.id, saveConversationAsRead]
  );

  const setActiveChat = (username) => {
    setConversations(convos => convos.map(convo => {
      if(convo.otherUser.username === username && convo.unreadCount !== 0) {
        // If this request fails, it'll get sent again the next time the user gets the convos
        // from the backend, so it doesn't need error handling or an await.
        saveConversationAsRead(convo.id);
        return {
          ...convo,
          unreadCount: 0
        }
      }
      return convo;
    }));
    setActiveConversation(username);
  };

  const addOnlineUser = useCallback((id) => {
    setConversations((prev) =>
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
    setConversations((prev) =>
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

  const setOthersLatestReadLocally = useCallback(({ conversationId, message }) => {
    setConversations(prev => prev.map(convo => {
      if (convo.id === conversationId) {
        return { 
          ...convo,
          othersLatestReadMessage: message
        };
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
    socket.on('latest-read', setOthersLatestReadLocally);

    return () => {
      // before the component is destroyed
      // unbind all event handlers used in this component
      socket.off('add-online-user', addOnlineUser);
      socket.off('remove-offline-user', removeOfflineUser);
      socket.off('new-message', addMessageToConversation);
      socket.off('latest-read', setOthersLatestReadLocally);
    };
  }, [addMessageToConversation, addOnlineUser, removeOfflineUser, setOthersLatestReadLocally, socket]);

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
        setConversations(data);
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
