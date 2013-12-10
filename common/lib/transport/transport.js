var Transport = (function() {
	var isBrowser = (typeof(window) == 'object');
	var messagetypes = isBrowser ? clientmessage_refs : require('../nodejs/lib/protocol/clientmessage_types');
	var actions = messagetypes.TAction;
	var flags = messagetypes.TFlags;
	var noop = function() {};

	/*
	 * EventEmitter, generates the following events:
	 * 
	 * event name       data
	 * closed           error
	 * failed           error
	 * connected        null error, connectionId
	 * event            channel message object
	 */

	/* public constructor */
	function Transport(connectionManager, auth, params) {
		EventEmitter.call(this);
		this.connectionManager = connectionManager;
		this.auth = auth;
		this.params = params;
		this.isConnected = false;
	}
	Utils.inherits(Transport, EventEmitter);

	Transport.prototype.connect = function() {};

	Transport.prototype.close = function(closing) {
		this.isConnected = false;
		this.emit('closed', ConnectionError.closed);
		this.sendClose(closing);
		this.dispose();
	};

	Transport.prototype.abort = function(error) {
		this.isConnected = false;
		this.emit('failed', error);
		this.sendClose(true);
		this.dispose();
	};

	Transport.prototype.onChannelMessage = function(message) {
		switch(message.action) {
		case actions.HEARTBEAT:
			this.emit('heartbeat');
			break;
		case actions.CONNECTED:
			this.onConnect(message);
			this.emit('connected', null, this.connectionId, message.flags);
			break;
		case actions.CLOSED:
		case actions.DISCONNECTED:
			this.isConnected = false;
			this.onDisconnect();
			/* FIXME: do we need to emit an event here? */
			break;
		case actions.ACK:
			this.emit('ack', message.msgSerial, message.count);
			break;
		case actions.NACK:
			this.emit('nack', message.msgSerial, message.count, message.error);
			break;
		case actions.ERROR:
			if(!message.channel) {
				/* a transport error */
				var msgErr = message.error,  err = {
					statusCode: msgErr.statusCode,
					code: msgErr.code,
					reason: msgErr.reason
				};
				this.abort(err);
				break;
			}
			/* otherwise it's a channel-specific error, so handle it in the channel */
		default:
			this.connectionManager.onChannelMessage(message, this);
		}
	};

	Transport.prototype.onConnect = function(message) {
		this.connectionId = message.connectionId;
		this.isConnected = true;
		/* if the connected message asks us to sync the time with the server, make the request */
		/* FIXME: deprecated behaviour? probably remove
		if(message.flags && (message.flags & (1 << flags.SYNC_TIME))) {
			var self = this;
			Utils.nextTick(function() {
				self.connectionManager.realtime.time({connection_id:message.connectionId});
			});
		}
		*/
	};

	Transport.prototype.onDisconnect = function() {};

	Transport.prototype.onClose = function(wasClean, reason) {
		/* if the connectionmanager already thinks we're closed
		 * then we probably initiated it */
		if(this.connectionManager.state.state == 'closed')
			return;
		var newState = wasClean ?  'disconnected' : 'failed';
		this.isConnected = false;
		var error = Utils.copy(ConnectionError[newState]);
		if(reason) error.reason = reason;
		this.emit(newState, error);
	};

	Transport.prototype.dispose = function() {
		this.off();
	};

	return Transport;
})();
