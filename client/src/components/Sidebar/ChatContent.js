import React from "react";
import { Box, Typography } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    justifyContent: "space-between",
    marginLeft: 20,
    flexGrow: 1,
  },
  textContainer: {
    maxWidth: '11rem'
  },
  username: {
    fontWeight: "bold",
    letterSpacing: -0.2,
  },
  previewText: {
    fontSize: 12,
    color: "#9CADC8",
    letterSpacing: -0.17,
  },
  unreadPreviewText: {
    fontWeight: "bold",
    fontSize: 14,
    color: "black",
    letterSpacing: -0.17,
  },
  countContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  },
  countBubble: {
    borderRadius: '1000px',
    backgroundColor: '#3A8DFF',
    color: 'white',
    padding: '3px 10px',
    flexGrow: 1,
    minWidth: '25px',
    textAlign: 'center'
  }
}));

const ChatContent = ({ conversation }) => {
  const classes = useStyles();

  const { otherUser } = conversation;
  const latestMessageText = conversation.id && conversation.latestMessage?.text;
  const latestMessageClass = conversation.unreadCount ? classes.unreadPreviewText : classes.previewText;

  return (
    <Box className={classes.root}>
      <Box className={classes.textContainer}>
        <Typography className={classes.username}>
          {otherUser.username}
        </Typography>
        <Typography noWrap className={latestMessageClass}>
          {latestMessageText}
        </Typography>
      </Box>
      <Box className={classes.countContainer}>
        {!!conversation.unreadCount && (
          <Box className={classes.countBubble}>
            {conversation.unreadCount}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ChatContent;
