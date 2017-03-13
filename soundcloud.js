const api_url = 'https://api.soundcloud.com'

/**
* Soundcloud API Abstraction
*/
class Soundcloud {

	/**
	* Fetch data
	*
	* @returns {Promise}
	*/
	static fetchData () {

		return new Promise((resolve, reject) => {

			if (!settings.soundcloud.refresh_token) {
				settings.soundcloud.error = true;
				return reject([null, true]);
			}

			api.init('soundcloud', data.client_ids.soundcloud.client_id, data.client_ids.soundcloud.client_secret);

			api.refreshToken('soundcloud', settings.soundcloud.refresh_token, (error, creds) => {

				if (error) {
					settings.soundcloud.error = true;
					return reject([error, true]);
				}

				data.soundcloud = [];

				settings.soundcloud.refresh_token = creds.refresh_token;
				settings.soundcloud.access_token = creds.access_token;

				api.get('soundcloud', '/me/favorites', settings.soundcloud.access_token, { limit: 200 }, (err, favorites) => {

					if (err) return reject([err]);

					let tempTracks = [];

					for (let tr of favorites)
						if (typeof tr.stream_url !== "undefined")
							tempTracks.push(convertTrack(tr));

					data.soundcloud.unshift({
						id: 'favs',
						title: 'Liked tracks',
						icon: 'heart',
						artwork: '',
						tracks: tempTracks
					});

					api.get('soundcloud', '/me/activities', settings.soundcloud.access_token, { limit: 200 }, (err, result) => {

						if (err) return reject([err]);

						let tempTracks = [];

						for (let i of result.collection) {
							const originNotValid = (i.origin === null || typeof i.origin.stream_url === "undefined");
							const isTrack = i.type === "track";
							const isShare = i.type == "track-sharing";
							const isRepost = i.type == "track-repost";

							if (!originNotValid && (isTrack || isShare || isRepost)) {
								tempTracks.push(convertTrack(i.origin));
							}
						}

						data.soundcloud.push({
							id: 'stream',
							title: 'Feed',
							icon: 'globe',
							artwork: '',
							tracks: tempTracks
						});

						api.get('soundcloud', '/me/playlists', settings.soundcloud.access_token, { limit: 200 }, (err, result) => {

							if (err) return reject([err]);

							for (let i of result) {
								let temp_tracks = [];

								for (let t of i.tracks) {
									if (typeof t.stream_url !== "undefined") {
										temp_tracks.push(convertTrack(t));
									}
								}

								data.soundcloud.push({
									id: i.id,
									title: i.title,
									artwork: i.artwork_url || "",
									tracks: temp_tracks
								});

							}

							resolve();
						});


					});

				});

			});
		});
	}

	/**
	 * Called when user wants to activate the service
	 *
	 * @param callback {Function} Callback function
	 */
	static login (callback) {

		api.oauthLogin('soundcloud', code => {

			api.init('soundcloud', data.client_ids.soundcloud.client_id, data.client_ids.soundcloud.client_secret);

			api.auth('soundcloud', code, (error, data) => {
				if (error || data.error) {
					return callback(`${error} + ${data.error}`);
				}

				settings.soundcloud.refresh_token = data.refresh_token;
				callback();
			});

		});

	}

	/**
	 * Like a song
	 *
	 * @param trackId {string} The track's id (It uses g.playing instead though?)
	 */
	static like (trackId) {
		api.put('soundcloud', `/me/favorites/${g.playing.id}`, settings.soundcloud.access_token, {}, (err, result) => {
			if (err) new Notification('Error liking track', {
				'body': err,
				'tag': 'Harmony-Error',
				'origin': 'Harmony'
			});
		});
	}

	/**
	 * Unlike a track
	 *
	 * @param trackId {string} The track's ID
	 */
	static unlike (trackId) {
		api.delete('soundcloud', `/me/favorites/${g.playing.id}`, settings.soundcloud.access_token, {}, (err, result) => {
			if (err) new Notification('Error liking track', {
				'body': err,
				'tag': 'Harmony-Error',
				'origin': 'Harmony'
			});
		});
	}

	/**
	 * Gets a track's streamable URL
	 *
	 * @param track {Object} The track object
	 * @param callback {Function} The callback function
	 */
	static getStreamUrl (track, callback) {
		callback(track.stream_url + "?client_id=" + data.client_ids.soundcloud.client_id, track.id);
	}

	/**
	* View a track's artist
	*
	* @param track {Object} The track object
	*/
	static viewArtist (track) {
		specialView('soundcloud', 'loading', 'artist', track.artist.name);

		request({ url:  api_url+`/users/${track.artist.id}`+ "?client_id=" + data.client_ids.soundcloud.client_id, method: "GET", json: true}, (err, result, body) => {
			if (err) return console.error(err);

			let image = body.avatar_url;

			request({ url:  api_url+`/users/${track.artist.id}/tracks?limit=200`+ "&client_id=" + data.client_ids.soundcloud.client_id, method: "GET", json: true}, (err, result, body) => {
				if (err) return console.error(err);

				let tracks = [];

				for (let tr of body)
					if (typeof tr.stream_url != "undefined")
						tracks.push(convertTrack(tr));

				specialView('soundcloud', tracks, 'artist', track.artist.name, image);

			});
		});
	}

	/**
	 * Search
	 * @param query {String}: the query of the search
	 * @param callback
	 */
	static searchTracks (query, callback) {

		request({ url:  api_url+`/tracks?q=`+encodeURI(query)+ "&client_id=" + data.client_ids.soundcloud.client_id, method: "GET", json: true}, (err, result, body) => {
			if (err) return console.error(err);

			let tracks = [];

			for (let tr of body)
				if (typeof tr.stream_url != "undefined")
					tracks.push(convertTrack(tr));

			callback(tracks)

		});
	}

}

/** Static Properties **/
Soundcloud.fullName = "SoundCloud";
Soundcloud.favsLocation = "soundcloud,favs";
Soundcloud.scrobbling = true;
Soundcloud.color = "#EF4500";
Soundcloud.settings = {
	active: false
};

Soundcloud.contextmenuItems = [

	{
		title: 'View user',
		fn: () => Soundcloud.viewArtist(trackList[index])
	}

];

Soundcloud.loginBtnHtml = `

	<a id='Btn_soundcloud' class='button login soundcloud hide' onclick="login('soundcloud')">Listen with <b>SoundCloud</b></a>
	<a id='LoggedBtn_soundcloud' class='button login soundcloud hide' onclick="logout('soundcloud')">Disconnect</a>
	<span id='error_soundcloud' class='error hide'>Error, please try to login again</span>

`;

Soundcloud.loginBtnCss = `
	.soundcloud {
	  background-color: #EF4500;
	  background-image: url('data:image/png;base64,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');
	}
`;

const convertTrack = (rawTrack) => {
	return {
		'service': 'soundcloud',
		'title': removeFreeDL(rawTrack.title),
		'artist': {
			'id': rawTrack.user.id,
			'name': rawTrack.user.username
		},
		'album': {
			'id': '',
			'name': ''
		},
		'share_url': rawTrack.permalink_url,
		'id': rawTrack.id,
		'stream_url': rawTrack.stream_url,
		'duration': rawTrack.duration,
		'artwork': rawTrack.artwork_url
	};
};

const removeFreeDL = (string) => {
	return string.replace("[Free DL]", "")
			  .replace("(Free DL)", "")
			  .replace("[Free Download]", "")
			  .replace("(Free Download)", "")
			  .replace("\"Free Download\"", "")
			  .replace("(FREE DOWNLOAD)", "")
			  .replace("[FREE DOWNLOAD]", "")

};

module.exports = Soundcloud;