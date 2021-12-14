/*
Copyright (C) 2016 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
const URL = require('url').URL

const HTTPMixin = (base) => class extends base {
  // Pre and Post middleware functions
  // They will allow plugging of file uploads and any further manipulation of requests
  preMiddleware (method) { return (req, res, next) => next(null) }
  postMiddleware (method) { return (req, res, next) => next(null) }

  // How to chain errors
  static get chainErrors () { return 'nonhttp' }

  constructor () {
    super()
    this.chainerrors = this.constructor.chainerrors
  }

  // Sends the information out, for HTTP calls.
  // The medium is request._res, which is set in protocolListenHTTP
  protocolSendHTTP (request, method, data) {
    const self = this
    let from
    let to
    let responseBody
    let status = 200

    // If it's sending and error, `data` is the actual error. It will be
    // formatted using the object's formatErrorResponse method
    if (method === 'error') responseBody = self.formatErrorResponse(data)
    else responseBody = data

    // Sets location and range headers
    switch (method) {
      case 'post':
        status = 201
        if (self.handleGet) { request._res.setHeader('Location', request._req.originalUrl + data[self.idProperty]) }
        break

      case 'put':
        status = 201
        if (self.handleGet) {
          request._res.setHeader('Location', request._req.originalUrl)
        }
        break

      case 'delete':
        status = 200
        break

      case 'error':
        status = data.status || 500
        break

      case 'getQuery':
        if (request.options.skip || request.options.limit) {
          // Working out from-to/of
          // Note that if no records were returned, the format should be 0-0/X

          // Nice shorter constiables
          const skip = request.options.skip || 0
          const total = request.total

          // Work out 'of': it will depend on the grandTotal, and that's it. It's an easy one.
          const of = request.grandTotal

          if (typeof request.grandTotal !== 'undefined') {
            // If nothing was returned, then the format 0-0/grandTotal is honoured
            if (!total) {
              from = 0
              to = 0
            // If something was returned, then `from` is the same as `skip`, and `to`
            // will depends on how many records were returned
            } else {
              from = skip
              to = from + total - 1
            }

            request._res.setHeader('Content-Range', 'items ' + from + '-' + to + '/' + of)
          }
        }
        break
    }
    // Send the response using HTTP
    request._res.status(status).json(responseBody)
  }

  listen (params) {
    let url = this.fullPublicURL()
    const app = params.app
    let idName

    // Public URL must be set
    if (!url) {
      throw (new Error('listen() must be called on a store with a public URL'))
    }

    // First, look for the last /some/:word in the URL
    idName = url.match(/:\w*$/)
    if (!idName) {
      throw (new Error("A store's URL needs to end with a :columned token representing its ID, this is not valid: " + url))
    } else {
      // Found it: normalise it to a simple string rather than the 1 element array we received
      idName = idName[0]
    }

    url = url.replace(/:\w*$/, '')
    // console.log('URL:', url)

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(url + idName, this.preMiddleware('get'), this._getRequestHandler('get'), this.postMiddleware('get'))
    app.get(url, this.preMiddleware('getQuery'), this._getRequestHandler('getQuery'), this.postMiddleware('getQuery'))
    app.put(url + idName, this.preMiddleware('put'), this._getRequestHandler('put'), this.postMiddleware('put'))
    app.post(url, this.preMiddleware('post'), this._getRequestHandler('post'), this.postMiddleware('post'))
    app.delete(url + idName, this.preMiddleware('delete'), this._getRequestHandler('delete'), this.postMiddleware('get'))
  }

  _getRequestHandler (method, field) {
    const self = this

    if (['get', 'getQuery', 'put', 'post', 'delete', 'getField', 'putField'].indexOf(method) === -1) {
      throw (new Error('method can be get, getQuery, put, post, delete, fetField, putField'))
    }

    return async function (req, res, next) {
      const request = {}

      const funcName = method[0].toUpperCase() + method.slice(1)

      try {
        const _sleep = (ms) => { if (!ms) return; return new Promise(resolve => setTimeout(resolve, ms)) }

        // Initiating a request from the server resulted in an empty req.body.
        // Making sure it's always there
        req.body = req.body || {}

        Object.setPrototypeOf(req.body, Object.prototype)

        // Sets all of the required fields for a request
        request.remote = true
        request.protocol = 'HTTP'
        request.params = { ...req.params }
        request.body = { ...req.body }
        request.session = req.session
        request.options = {}
        request.method = method

        try {
          request.options = self._initOptionsFromReq(method, req)
        } catch (e) { return next(e) }

        // Sets the request's _req and _res constiables, extra fields hooks might want to use
        // request._res will be used as a sending medium by protocolSendHTTP
        request._req = req
        request._res = res

        // I dreamed of being able to do this in node for _years_
        await _sleep(self.constructor.artificialDelay)

        try {
          const data = await self['_make' + funcName](request)
          self.protocolSendHTTP(request, method, data)
        } catch (error) {
          // Let the store log the error
          self.logError(request, error)

          // See what to do with the error
          const chainErrors = self.constructor.chainErrors

          // Case #1: All errors are to be chained: chain
          if (chainErrors === 'all') return next(error)

          // Case #2: Only non-http errors are to be chained. "Maybe" chain, "maybe" not
          if (chainErrors === 'nonhttp') {
            if (typeof error.status === 'undefined') return next(error)
            else self.protocolSendHTTP(request, 'error', error)
          }
          // Case #3: No errors are to be chained: send error regardless
          if (chainErrors === 'none') {
            self.protocolSendHTTP(request, 'error', error)
          }
        }
      } catch (e) {
        return next(e)
      }
    }
  }

  _initOptionsFromReq (method, req) {
    const self = this

    let options = {}

    // Set the 'overwrite' option if the right header
    // is there
    if (method === 'put') {
      if (req.headers['if-match'] === '*') {
        options.overwrite = true
      }
      if (req.headers['if-none-match'] === '*') {
        options.overwrite = false
      }
    }

    // deleteAfterGetQuery will depend on the store's setting
    if (method === 'getQuery') {
      if (self.deleteAfterGetQuery) options.delete = !!self.deleteAfterGetQuery
    }

    // Put and Post can come with extra headers which will set
    // options.putBefore and options.putDefaultPosition
    if (method === 'put' || method === 'post') {
      // positioning can be 'after', 'start' or 'end'
      if (typeof (req.headers.placement) !== 'undefined') {
        options.placement = req.headers.placement

        if (options.placement === 'after') {
          options.placementAfter = req.headers['placement-after']
        }
      }
    }

    // Set the `SortBy`, `skip`, `limit`,  `conditions` in
    // the options, based on the passed headers
    if (method === 'getQuery') {
      options = { ...options, sort: self._parseSortBy(req), ...self._parseRangeHeaders(req) }
    }
    if (method === 'getQuery' || method === 'get') {
      options.conditionsHash = self._parseConditions(req)
    }

    // If self.defaultSort was passed, then maybe it needs to be applied (depending on options.sort)
    if (self.defaultSort) {
      // If it's not a valid object, it's null, or it IS a valid object but it's empty, apply default sorting
      if (typeof (options.sort) !== 'object' || options.sort === null || Object.getOwnPropertyNames(options.sort).length === 0) {
        options.sort = self.defaultSort
      }
    }

    return options
  }

  _parseSortBy (req) {
    const sortObject = {}
    let token, tokenClean
    let sortDirection, sortField

    const self = this

    const sortBy = new URL(req.url, 'http://localhost/').searchParams.get('sortBy') || ''

    // No sort options: return an empty object
    if (!sortBy) return {}

    const tokens = sortBy.split(',')
    for (let i = 0; i < tokens.length; i++) {
      token = tokens[i]

      tokenClean = token.replace('+', '').replace('-', '').replace(' ', '').replace('*', '')

      if (self.sortableFields.indexOf(tokenClean) === -1) {
        throw (new Error('Field selected for sorting invalid: ' + tokenClean))
      }

      if (tokens[i][0] === '*' || tokens[i][0] === ' ' || tokens[i][0] === '+' || tokens[i][0] === '-') {
        sortDirection = tokens[i][0] === '-' ? -1 : 1
        sortField = tokenClean
        sortObject[sortField] = sortDirection
      }
    }
    return sortObject
  }

  _parseRangeHeaders (req) {
    let tokens
    let rangeFrom, rangeTo, limit
    let hr

    // If there was a range request, then set the range to the
    // query and return the count
    if ((hr = req.headers.range) && (tokens = hr.match(/items=([0-9]+)-(([0-9]+)||(Infinity))$/))) {
      rangeFrom = Number(tokens[1])
      rangeTo = Number(tokens[2])
      if (rangeTo === 'Infinity') {
        return ({
          skip: rangeFrom
        })
      } else {
        limit = rangeTo - rangeFrom + 1

        return ({
          skip: rangeFrom,
          limit: limit
        })
      }
    }

    // Range headers not found or not valid, return null
    return { skip: 0, limit: this.defaultLimitOnQueries }
  }

  _parseConditions (req) {
    const searchParams = new URL(req.url, 'http://localhost/').searchParams
    const r = {}

    for (const [key, value] of searchParams) {
      if (key !== 'sortBy') r[key] = value
    }
    return r
  }
}

exports = module.exports = HTTPMixin
