const ytdl = require('ytdl-core') 
const api_url = "https://www.googleapis.com/youtube/v3"
const auth_url = "https://www.googleapis.com/oauth2/v4/token"

const apiRequest = (method, url, auth, params, callback) => {

	if (!url.includes('https://')) url = api_url+url

	let requestOptions = { url: url, method: method, json: true}

	if (auth) requestOptions.auth = { bearer: settings.youtube.access_token }
	else params.key = settings.client_ids.youtube.key
	

	let urlParameters = Object.keys(params).map((i) => typeof params[i] !== 'object' && !getParameterByName(i, requestOptions.url) ? i+'='+params[i]+'&' : '' ).join('') // transforms to url format everything except objects
	requestOptions.url += (requestOptions.url.includes('?') ? '&' : '?') + urlParameters
	
	if (method !== 'GET') {
		requestOptions.json = params
	}

	request(requestOptions, (err, result, body) => {

		if (body && body.error) callback(body.error, body)
		else callback(err, body)
	})

}

const auth = (code, callback) => {

	request.post({
		url: auth_url, 
		json: true, 
		form: {
			client_id: settings.client_ids.youtube.oauth_id,
			client_secret: settings.client_ids.youtube.oauth_secret,
			grant_type: 'authorization_code',
			redirect_uri: 'http://localhost',
			code: code
		} 
	}, (err, httpres, res) => {
		callback(err, res)
	})

}

const refreshToken = (callback) => {

	request.post({
		url: auth_url, 
		json: true, 
		form: {
			client_id: settings.client_ids.youtube.oauth_id,
			client_secret: settings.client_ids.youtube.oauth_secret,
			grant_type: 'refresh_token',
			redirect_uri: 'http://localhost',
			refresh_token: settings.youtube.refresh_token
		} 
	}, (err, httpres, res) => {
		if (err) return callback(err)

		settings.youtube.access_token = res.access_token
		callback()
	})

}

const convertTrack = rawTrack => {

	let id = rawTrack.id.videoId ? rawTrack.id.videoId : rawTrack.id

	return {
		service: 'youtube',
		title: rawTrack.snippet.title,
		artist: {
			id: rawTrack.snippet.channelId,
			name: rawTrack.snippet.channelTitle
		},
		album: {
			id: '',
			name: ''
		},
		share_url: 'https://youtu.be/'+id,
		id: id,
		duration: rawTrack.contentDetails ? ISO8601ToSeconds(rawTrack.contentDetails.duration)*1000 : null,
		artwork: rawTrack.snippet.thumbnails.default.url // For smaller artworks
	}
}

const extractIdFromUrl = url => {
	let regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
	let match = url.match(regExp)
	if (match && match[2].length == 11) return match[2]
	else return null
}


class Youtube {

	/**
	* Fetch data
	*
	* @returns {Promise}
	*/
	static fetchData () {


		return new Promise((resolve, reject) => {

			if (!settings.youtube.access_token) {
				settings.youtube.error = true
				return reject([null, true])
			}

			refreshToken(error => {

				if (error) {
					settings.youtube.error = true;
					return reject([error, true]);
				}

				let tempTracks = []

				function moreTracks(nextPageToken) {

					apiRequest('GET', '/videos', true, {myRating: 'like', part: 'snippet,contentDetails', maxResults: 50, pageToken: (nextPageToken || null)}, (err, res) => {

						if (err) return reject(err)

						for (let vid of res.items) 
							if ((settings.youtube.onlyMusicCategory && vid.snippet.categoryId === '10') || !settings.youtube.onlyMusicCategory)
								if (vid.snippet.liveBroadcastContent === 'none') // Disable livestreams
									tempTracks.push(convertTrack(vid))
						
						if (res.nextPageToken) moreTracks(res.nextPageToken)
						else over()

					})
				}

				moreTracks();

				function over() {
					Data.addPlaylist({
						service: 'youtube',
						title: 'Liked',
						id: 'favs',
						icon: 'thumbs-up',
						artwork: '',
						tracks: tempTracks
					})

					resolve()
				}
			})

			apiRequest('GET', '/playlists', true, {part: 'snippet', mine: 'true', maxResults: 50}, (err, res) => {
				if (err) return reject(err)
				
				for (let pl of res.items) {

					!function outer(pl) {

						let tempTracks = []

						function moreTracks(nextPageToken) {
							apiRequest('GET', '/playlistItems', true, {playlistId: pl.id, part: 'snippet', maxResults: 50, pageToken: (nextPageToken || null)}, (err, res) => {
								if (err) return reject(err)

								let tempIds = []

								for (let vid of res.items)
									tempIds.push(vid.snippet.resourceId.videoId)

								apiRequest('GET', '/videos', false, {id: tempIds.join(','), part: 'snippet,contentDetails'}, (err, result) => {
									if (err) return reject(err)

									for (let vid of result.items)
										tempTracks.push(convertTrack(vid))

									if (res.nextPageToken) moreTracks(res.nextPageToken)
									else over()

								})

							})
						}

						moreTracks();

						function over() {
							Data.addPlaylist({
								service: 'youtube',
								title: pl.snippet.title,
								id: pl.id,
								editable: true,
								artwork: '',
								tracks: tempTracks
							})
						}
					
					}(pl)
				}

			})

		})
	}

	/**
	 * Gets a track's streamable URL from it's youtube URL/id
	 *
	 * @param url {String} The YouTube url (or id) of the track
	 * @param callback {Function} The callback function
	 */
	static getStreamUrlFromVideo(url, callback) {

		ytdl.getInfo(url, [], (err, info) => {

			if (err) {
				console.error(err)
				return callback(err, null)
			}

			let formats = []

			for (let i of info.formats)
				if (!i.resolution) formats.push(i) // Keep only audio streams
			
			formats.sort((a, b) => { // We sort them by bitrate (pretty close to quality)
				return a.audioBitrate - b.audioBitrate
			})

			if (!settings.youtubeQuality || settings.youtubeQuality === 'normal') {

				for (let format of formats)
					if (format.audioBitrate > 100)
						return callback(null, format.url)

			} else if (settings.youtubeQuality == 'lowest') {

				return callback(null, formats[0].url)

			} else if (settings.youtubeQuality == 'best') {

				return callback(null, formats[formats.length - 1].url)

			} 

			callback("no stream for this url", null)
		})

	}

	/**
	 * Gets a track's streamable URL, the track doesn't need to be from YouTube
	 *
	 * @param track {Object} The track object
	 * @param callback {Function} The callback function
	 */
	static getStreamUrl(track, callback) {

		if (track.service === 'youtube') {
			this.getStreamUrlFromVideo(track.id, (err, url) => {
				callback(err, url, track.id)
			})
		} else { // Track isn't from youtube, let's try to find the closest match
	
			const duration = track.duration / 1000 // we want it in seconds
			const fullTitle = track.artist.name+' '+track.title

			apiRequest('GET', '/search', false, {q: encodeURIComponent(fullTitle), maxResults: 5, part: 'snippet', type: 'video', safeSearch: 'none'}, (err, res) => {

				if (err) return callback(err, null, track.id)

				let videoIds = []

				for (let i of res.items) {

					let videoTitle = i.snippet.title
					let comparisonTitle = fullTitle

					if (videoTitle.includes(' - ')) { // We can parse the real track name
						videoTitle = videoTitle.split(' - ')[1]
						comparisonTitle = track.title
					}

					if (similarity(videoTitle, comparisonTitle) > 0.4)
						videoIds.push(i.id.videoId)
				}

				videoIds.slice(0, 3) // Keep only first 3 results
				videoIds = videoIds.join() // Transforms to string

				let durations = []

				apiRequest('GET', '/videos', false, {id: videoIds, part: 'contentDetails'}, (err, res) => {
					if (err) return callback(err, null, track.id)

					for (let t of res.items)
						durations.push({id: t.id, duration_diff: Math.abs(ISO8601ToSeconds(t.contentDetails.duration) - duration)})

					durations.sort((a, b) => { // We sort potential tracks by duration difference with original track
						return a.duration_diff - b.duration_diff
					})

					if (!durations[0]) return callback('No corresponding track found', null, track.id)

					this.getStreamUrlFromVideo(durations[0].id, (err, url) => {
						callback(err, url, track.id)
					})

				})
			})
		}
	}


	static resolveTrack (url, callback) {
		let id = extractIdFromUrl(url)
		if (!id) return callback('invalid youtube URL')

		refreshToken(error => {
			apiRequest('GET', '/videos', false, {id: id, part: 'snippet,contentDetails'}, (err, res) => {
				if (err || error) callback(err || error)
				let track = convertTrack(res.items[0])

				callback(null, track)
			})
		})
	}


	/**
	* Called when user wants to activate the service
	*
	* @param callback {Function} Callback function
	*/
	static login (callback) {

		const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${settings.client_ids.youtube.oauth_id}&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/youtube`;
		oauthLogin(oauthUrl, (code) => {

			if (!code) return callback('stopped')

			auth( code, (err, data) => {

				if (err) return callback(err)

				settings.youtube.access_token = data.access_token
				settings.youtube.refresh_token = data.refresh_token

				callback()
			})

		})

	}

	/**
	* Search
	* @param query {String}: the query of the search
	* @param callback
	*/
	static searchTracks (query, callback) {

		refreshToken(error => {

			apiRequest('GET', '/search', false, {q: encodeURIComponent(query), maxResults: 10, part: 'snippet', type: 'video', videoCategoryId: '10', safeSearch: 'none'}, (err, res) => {

				if (err) return console.error(err)
				let tracks = []

				for (let tr of res.items)
					if (tr) tracks.push(convertTrack(tr))

				callback(tracks, query)

			})
		})
	}



	/**
	* Add a track to a playlist
	*
	* @param tracks {Object} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	static addToPlaylist (tracks, playlistId, callback) {

		refreshToken(error => {
			if (error) callback(error)

			let i = 0;
			function differedLoop(video_id) { // So we make 1 request/2 secs as YouTube doesn't allow to send multiple ids :(
				add(video_id);

				setTimeout(_ => {
					i++;
					if (i < tracks.length) differedLoop(tracks[i].id);
				}, 2000);
			}

			function add(id) {
				apiRequest('POST', '/playlistItems', true, {
					part: 'snippet',
					snippet: {
						playlistId: playlistId,
						resourceId: {
							kind: "youtube#video",
							videoId: id
						}
					}
				}, (err, res) => {
					if (err) callback(err)
				})
			}

			differedLoop(tracks[0].id)

		})
	}



	/**
	* Remove a track from a playlist
	*
	* @param tracks {Object} The tracks objects
	* @param playlistId {string} The playlist ID
	*/
	/*static removeFromPlaylist (tracks, playlistId, callback) {

	}
	*/


	/**
	* Like a song
	*
	* @param track {Object} The track object
	*/

	static like (track, callback) {
		refreshToken(error => {
			apiRequest('POST', '/videos/rate', true, {id: track.id, rating: 'like'}, (err, res) => {
				callback(error || err)
			})
		})
	}

	/**
	* Unlike a song
	*
	* @param track {Object} The track object
	*/

	static unlike (track, callback) {
		refreshToken(error => {
			apiRequest('POST', '/videos/rate', true, {id: track.id, rating: 'none'}, (err, res) => {
				callback(error || err)
			})
		})
	}


}

Youtube.fullName = "YouTube"
Youtube.favsLocation = "youtube,favs"
Youtube.color = "red"
Youtube.scrobbling = true
Youtube.settings = {
	active: false,
	quality: 'normal',
	onlyMusicCategory: true
}

Youtube.settingsItems = [
	{
		description: 'Only fetch videos with music category',
		type: 'checkbox',
		id: 'onlyMusicCategory'
	},
	{
		description: 'Playback quality',
		type: 'select',
		id: 'quality',
		options: [{
			value: 'lowest', title: 'Lowest'
		},{
			value: 'normal', title: 'Normal'
		},{
			value: 'best', title: 'Best'
		}]
	}
]

Youtube.loginBtnHtml = `

	<div id='Btn_youtube' class='button login youtube hide' onclick="login('youtube')">Listen with <b>YouTube</b></div>
	<div id='LoggedBtn_youtube' class='button login youtube hide' onclick="logout('youtube')">Disconnect</div>
	<span id='error_youtube' class='error hide'>Error, please try to login again</span>

`

Youtube.loginBtnCss = `
	.youtube {
	  background-color: red;
	  background-image: url('data:image/png;base64,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');
	}
`

module.exports = Youtube