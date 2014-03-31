
/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*

  TODO:
Tests for:
  * self.deleteAfterGetQuery 
  * { delete: true } in GetQuery
  * Missing paramId in API Post or Put
  * Check that paramId have priority over body for putExisting, putNew, post
  * Check that indexing works
  * Test hook bodyPostValidate
  * Check postValidate
*/

var 
  dummy

, declare = require('simpledeclare')
, async = require('async')
, Schema = require('simpleschema')
;

function makeReq( params ){
  var req = {};

  req.url = "http://www.example.com/";
  req.headers = {};
  req.params = {}; 
  req.body = {};

  [ 'url', 'headers', 'params', 'body' ].forEach( function( k ){
    if( params[ k ] ) req[ k ] = params[ k ];
  });

  req.originalUrl = req.url;

  return req;

}

var RES = function( func ){

  this._headers = {};

  this.send = function( status, data ){
    func.call( this, null, 'bytes', this._headers, status, data );
  };

  this.json = function( status, data ){
    func.call( this, null, 'json', this._headers, status, data );
  };

  this.setHeader = function( header, value ){
    this._headers[ header ] = value;
  };



}

var peopleData = exports.peopleData = [
  { name: 'Chiara',    surname: 'Mobily',     age: 22 },
  { name: 'Tony',      surname: 'Mobily',     age: 37 },
  { name: 'Sara',      surname: 'Connor',     age: 14 },
  { name: 'Daniela',   surname: 'Mobily',     age: 64 },
];


function l( v ){
  console.log( require( 'util' ).inspect( v, { depth: 10 } ) );
}

var compareCollections = function( test, a, b ){

  // Makes sure that records have the keys in the right order
  var a0 = [];
  for( var i = 0, l = a.length; i < l; i ++ ){
    var item = a[ i ];
    var newItem = {};
    Object.keys( item ).sort().forEach( function( k ){
      newItem[ k ] = item[ k ];
    });
    delete newItem._children;
    a0.push( newItem );
  }
  var b0 = [];
  for( var i = 0, l = b.length; i < l; i ++ ){
    var item = b[ i ];
    var newItem = {};
    Object.keys( item ).sort().forEach( function( k ){
      newItem[ k ] = item[ k ];
    });
    delete newItem._children;
    b0.push( newItem );
  }

 try {
    var a1 = [], a2, a3;
    a0.forEach( function( item ){
      a1.push( JSON.stringify( item ) );
    });
    a2 = a1.sort();
    a3 = JSON.stringify( a2 );

    var b1 = [], b2, b3;
    b0.forEach( function( item ){
      b1.push( JSON.stringify( item ) );
    });
    b2 = b1.sort();
    b3 = JSON.stringify( b2 );
  } catch ( e ){
    test.fail( a, b, "Comparison failed", "recordset comparison" );
  }

  equal = ( a3 == b3 );

  if( ! equal ){
    test.fail( a, b, "Record sets do not match", "recordset comparison" );
    //test.fail( a, b, console.log("MISMATCH BETWEEN:" );
    //console.log( a );
    //console.log( b );
    //console.log( a3 );
    //console.log( b3 );

    console.log( (new Error()).stack );
  }

  //test.ok( equal, "Record sets do not match" );

}


var populateCollection = function( data, collection, cb ){

  var functions = [];

  // Populate the database
  data.forEach( function( datum ){

    functions.push( function( done ){
      collection.insert( datum, function( err ){
        if( err ){
          cb( err );
        } else{
          done( null );
        }
      })
    })

  })

  async.series( functions, function( err, res ){
    if( err ){
      cb( err );
    } else {
      cb( null );
    }
  });
}


var clearAndPopulateTestCollection = function( g, cb ){
  
  g.people.delete( { }, { multi: true }, function( err ){
   if( err ){
      cb( err );
    } else {

      populateCollection( peopleData, g.people, function( err ){
        if( err ){
          cb( err );
        } else {

          cb( null );

        }
      })
    }
  })
}



process.on('uncaughtException', function(err) {
  console.error(err.stack);
});

//Error.stackTraceLimit = Infinity;

exports.get = function( getDbAndDbLayerAndJRS, closeDb ){
  
  var tests;
  var g = {};

  var startup = function( done ){

    var self = this;

    process.on('uncaughtException', function(err) {
      console.error(err.stack);
    });


    getDbAndDbLayerAndJRS( function( err, db, DbLayer, JRS ){
      if( err ){
        throw( new Error("Could not connect to db, aborting all tests") );
        process.exit();
      }

      // Set the important g.driver variables (db and DriverMixin)
      g.db = db;
      g.DbLayer = DbLayer;
      g.JRS = JRS;

      // Set the basic stores
      g.People = declare( g.JRS, {

        schema: new Schema({
          id:          { type: 'id' },
          name:        { type: 'string', searchable: true },
          surname:     { type: 'string', searchable: true, max: 20 },
          age:         { type: 'number', searchable: true, max: 99 },
          extra:       { type: 'string', max: 99, doNotSave: true },
        }),

        onlineSearchSchema: new Schema({
          name:     { type: 'string', searchable: { type: 'eq' }  },
          surname:  { type: 'string', max: 20, searchable: true },
          age:      { type: 'number', max: 99, searchable: true, },
          ageGt:    { type: 'number', max: 99, searchable: true, searchOptions: { field: 'age', type: 'gt' } },
          nameSt:   { type: 'string', searchable: true, searchOptions: { field: 'surname', type: 'startsWith' } },
        }),
        sortableFields: [ 'name', 'surname', 'age' ],

        storeName: 'people',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ 'id' ],
      });
      g.people = new g.People();
     
      // Set the basic stores
      g.WsPeople = declare( g.JRS, {

        schema: new Schema({
          id:          { type: 'id', required: true },
          workspaceId: { type: 'id', required: true },
          name:        { type: 'string' },
          surname:     { type: 'string', max: 20 },
          age:         { type: 'number', max: 99 },
          extra:       { type: 'string', max: 99, doNotSave: true },
        }),

        onlineSearchSchema: new Schema({
          name:     { type: 'string', searchable: true, searchOptions: { type: 'eq' } },
          surname:  { type: 'string', max: 20, searchable: true },
          age:      { type: 'number', max: 99, searchable: true },
          ageGt:    { type: 'number', max: 99, searchable: true, searchOptions: { field: 'age', type: 'gt' } },
          nameSt:   { type: 'string', searchable: true, searchOptions: { field: 'surname', type: 'startsWith' } },
        }),

        storeName: 'wsPeople',

        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,

        paramIds: [ 'workspaceId', 'id' ],
      });
      g.wsPeople = new g.WsPeople();
     

      // Clear people table
      //g.dbPeople = new g.DbLayer( 'people', {  name: true, surname: true, age: false, id: true }  ); 
      g.dbPeople = g.people.dbLayer;
      g.dbPeople.delete( { }, { multi: true }, function( err ){
        if( err ){
          throw( new Error("Could not empty people database, giving up") );
          process.exit();
        } else {
   
          // Clear people table
          //g.dbPeople = new g.DbLayer( 'people', {  name: true, surname: true, age: false, id: true }  ); 
          g.dbWsPeople = g.wsPeople.dbLayer;
          g.dbWsPeople.delete( { }, { multi: true }, function( err ){
            if( err ){
              throw( new Error("Could not empty wsPeople database, giving up") );
              process.exit();
            } else {
              if( typeof done === 'object') done.done();
              else done();
            }
          });
        };
      });
  
    });
  }
  
  
  var finish = function( test ){
   var self = this;
     closeDb( g.db, function( err ){
      if( err ){
        throw( new Error("There was a problem disconnecting to the DB") );
      }
      test.done();
    });
  };
  
  
  var console_log = console.log;
  console.log2 = function( m ){
    console_log("I WAS CALLED:");
    console_log( m );
    console_log( new Error().stack );
  }
  
  
  function zap( done ){
    g.dbPeople.delete( { }, { multi: true }, function( err ){
      if( err ){
        done( err );
      } else {
  
        g.dbWsPeople.delete( { }, { multi: true }, function( err ){
          if( err ){
            done( err );
          } else {
            done();
          }
        })
      }
    });
  }
  
  tests = {
  
    startup: startup,
  
    // *********************************
    // ********** POST *****************
    // *********************************
  
    /* POST:
       * REST  handlePost
       * REST  checkParamIds
       * APIh  prepareBody (post)
       * APIg  validate
       * REST  checkPermissionsPost
       * APIg  cleanup
       * APIh  extrapolateDoc
       * APIg  castDoc
       * REST  echoAfterPost
       * REST/APIh prepareBeforeSend
       * REST/APIh afterPost
    */
  
    'Post() API Working test': function( test ){
      zap( function(){
  
        g.people.apiPost( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person ){
          test.ifError( err );
 
          g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
            test.ifError( err );
            test.deepEqual( data[ 0 ], person );
  
            test.done();
          });
        });
      });
    },
  
    'Post() REST Working test': function( test ){
      zap( function(){
  
        var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
        (g.people.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'json' );
          test.equal( status, 201 );
          test.equal( headers.Location, 'http://www.example.com/' + data.id );
          test.equal( data.name, 'Tony' );
          test.equal( data.surname, 'Mobily' );
          test.ok( data.id );
  
          test.done();
        }))
      });
    },
  
  
    'Post() REST handlePost': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          handlePost: false,
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
        (people2.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
          test.equal( type, 'bytes' );
          test.equal( status, 501 );
  
          test.done();
        }));
      });
    },
  
    'Post() REST checkParamIds': function( test ){
      zap( function(){
  
        var req = makeReq( { params: { }, body: { name: 'Tony', surname: 'Mobily' } } );
        (g.wsPeople.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 400 );
          test.deepEqual( data,
  
  { message: 'Bad Request',
  errors: 
   [ { field: 'workspaceId',
       message: 'Field required in the URL: workspaceId' } ] }
          );
   
  
          test.done();
        }))
      });
    },
  
    'Post() APIh prepareBody (post)': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          prepareBody: function( request, body, method, done ){
            
            if( method === 'post' ){
              body.name = body.name + "_prepareBodyPost";
            }
            done( null );
          },
  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        // Set the basic stores
        people2.apiPost( { name: "Tony" }, function( err, person ){
          test.ifError( err );
          test.deepEqual( person,
  
  { name: 'Tony_prepareBodyPost',
  id: person.id }
  
          );        
  
          test.done();
        });
      });
    },
  
    'Post() APIg validate': function( test ){
      zap( function(){
  
        g.people.apiPost( { name: 'Tony', surname: "1234567890123456789012345", age: 37 }, function( err, person ){
           
          test.deepEqual( err.errors,  [ { field: 'surname', message: 'Field is too long: surname' } ] );
          test.equal( err.message, "Unprocessable Entity");
          test.equal( err.httpError, 422);
          test.done();
        });
      });
    },
  
    'Post() REST checkPermissionsPost': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          checkPermissionsPost: function( request, cb ){
            if( request.body.name === 'TONY' ) cb( null, false );
            else cb( null, true );
          },  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        var req = makeReq( { body: { name: 'TONY', surname: 'Mobily' } } );
        (people2.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 403 );
          test.done();
        }))
  
      });
    },
  
    'Post() APIg cleanup': function( test ){
      zap( function(){
  
        g.people.apiPost( { name: "Tony", extra: "Won't be saved" }, function( err, person ){
          test.ifError( err );
          test.deepEqual( person, { name: 'Tony', id: person.id } ); 
          test.done();
        });
      });
    },
  
    'Post() APIh extrapolateDoc': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          extrapolateDoc: function( request, fullDoc, done ){
  
            var doc = {};
            for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
            doc.name = doc.name + '_extrapolateDoc';
  
            done( null, doc );
          },
  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
   
        // Set the basic stores
        people2.apiPost( { name: "Tony" }, function( err, person ){
          test.ifError( err );
          test.deepEqual( person,
  
  { name: 'Tony_extrapolateDoc',
  id: person.id }
          );        
  
          test.done();
        });
      });
    },
  
    /*
    'Post() APIg castDoc': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          extrapolateDoc: function( request, fullDoc, done ){
  
            var doc = {};
            for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
            doc.age = doc.age.toString();
            done( null, doc );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();

        people2.apiPost( { name: 'Tony', age: 37 }, function( err, person ){
          test.ifError( err );
  
          test.equal( person.age, 37 );
          test.done();
        });
      })
    },
    */
  
    'Post() REST echoAfterPost': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          echoAfterPost: false
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
        (people2.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 201 );
          test.equal( data, '' );
          test.done();
        }))
      });
    },
  
    'Post() REST prepareBeforeSend': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

   
          prepareBeforeSend: function( request, doc, done ){
            doc.beforeSend = '_prepareBeforeSend';
  
            done( null );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
        
  
        var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
        (people2.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'json' );
          test.equal( status, 201 );
          test.equal( headers.Location, 'http://www.example.com/' + data.id );
          test.equal( data.name, 'Tony' );
          test.equal( data.surname, 'Mobily' );
          test.equal( data.beforeSend, '_prepareBeforeSend' );
          test.ok( data.id );
  
          test.done();
        }));
  
      });
    },
  
    'Post() APIh prepareBeforeSend': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          prepareBeforeSend: function( request, doc, done ){
            doc.beforeSend = '_prepareBeforeSend';

            done( null );
          },
  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        // Set the basic stores
        people2.apiPost( { name: "Tony" }, function( err, person ){
          test.ifError( err );
          test.deepEqual( person,
  
  { name: 'Tony',
  id: person.id,
  beforeSend: '_prepareBeforeSend' }
  
          );
  
          test.done();
        });
      });
    },
  
    'Post() REST afterPost': function( test ){
      zap( function(){
  
  
        var afterPost = false;
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

   
          afterPost: function( request, doc, fullDoc, done){
            afterPost = true;
            done( null );
          },
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( { body: { name: 'TONy', surname: 'Mobily' } } );
        (people2.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( afterPost, true );
          test.equal( status, 201 );
  
          test.done();
  
        }));
  
      }); 
  
    },
  
    'Post() APIh afterPost': function( test ){
      zap( function(){
  
        var afterPost = false;
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          afterPost: function( request, doc, fullDoc, done){
            afterPost = true;
            done( null );
          },
  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
   
        // Set the basic stores
        people2.apiPost( { name: "Tony" }, function( err, person ){
          test.ifError( err );
          test.equal( afterPost, true );
  
          test.done();
        });
      });
    },
  
  
  
    // *********************************
    // ********** PUT ******************
    // *********************************
  
    /* PUT:
       * REST  handlePut
       * REST  checkParamIds
       * APIh  prepareBody (put)
       * APIg  validate
       NEW:
       * REST  checkPermissionsPutNew
       * APIg  cleanup
       * APIh  extrapolateDoc
       * APIg  castDoc
       * REST  echoAfterPutNew
       * REST/APIh prepareBeforeSend (if echoAfterPutNew)
       * REST/APIh afterPutNew
       EXISTING:
       * APIh  (+)extrapolateDoc
       * APIg  (+)castDoc
       * REST  checkPermissionsPutExisting
       * APIg  cleanup
       * APIh  extrapolateDoc
       * APIg  castDoc
       * REST  echoAfterPutExisting
       * REST/APIh prepareBeforeSend (if echoAfterPutExisting)
       * REST/APIh afterPutExisting
    */
  
  
  
    'Put() API Working test (new, existing)': function( test ){
      zap( function(){
  
        // New
        var p = { id: 1234, name: 'Tony', surname: "Mobily", age: 37 };
        g.people.apiPut( null, p, function( err, person ){
          test.ifError( err );
  
          g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
            test.ifError( err );
            test.deepEqual( data[ 0 ], person );
  
            // Existing
            var p = { name: 'Tony', surname: "Mobily", age: 38 };
            g.people.apiPut( person.id, p, function( err, person ){
              test.ifError( err );
  
              g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
                test.ifError( err );
                test.deepEqual( data[ 0 ], person );
                test.equal( data[ 0 ].age, 38 );
  
                test.done();
              });
            });
          });
        });
  
      });
    },
  
    'Put() API Working test (overwrite)': function( test ){
      zap( function(){
  
        // New
        var p = { id: 1234, name: 'Tony', surname: "Mobily", age: 37 };
        g.people.apiPut( null, p, { overwrite: true }, function( err, person ){
  
          test.equal( err.message, "Precondition Failed" );
          test.equal( err.httpError, 412 );
  
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, function( err ){
  
            var p = { id: 1234, name: 'Tony', surname: "Mobily", age: 37 };
            g.people.apiPut( null, p, { overwrite: true }, function( err, person ){
              test.ifError( err );
  
              g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
                test.ifError( err );
                test.deepEqual( data[ 0 ], person );
  
  
                zap( function() {
  
                  // Existing
                  var p = { name: 'Tony', surname: "Mobily", age: 38 };
                  g.people.apiPut( person.id, p, { overwrite: false }, function( err, person ){
                    test.ifError( err );
  
                    g.dbPeople.select( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id } ]   }  }, function( err, data, total ){
                      test.ifError( err );
                      test.deepEqual( data[ 0 ], person );
                      test.equal( data[ 0 ].age, 38 );
  
                      var p = { name: 'Tony', surname: "Mobily", age: 38 };
                      g.people.apiPut( person.id, p, { overwrite: false }, function( err, person ){
  
                        test.equal( err.message, "Precondition Failed" );
                        test.equal( err.httpError, 412 );
  
                        test.done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    },
  
  
    'Put() REST Working test (new, existing)': function( test ){
      zap( function(){
  
        var req = makeReq( { url: 'http://www.example.com/1234', params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
        (g.people.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'json' );
          test.equal( status, 201 );
          test.equal( headers.Location, 'http://www.example.com/1234' );
          test.equal( data.name, 'Tony' );
          test.equal( data.surname, 'Mobily' );
          test.ok( data.id );
  
          var req = makeReq( {  url: 'http://www.example.com/1234', params: { id: 1234 }, body: { name: 'Tony2', surname: 'Mobily2' } } );
          (g.people.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
 
            test.equal( type, 'json' );
            test.equal( status, 200 );
            test.equal( headers.Location, 'http://www.example.com/1234' );
            test.equal( data.name, 'Tony2' );
            test.equal( data.surname, 'Mobily2' );
            test.ok( data.id );
  
            test.done();
          }));
        }));
      });
    },
  
  
    'Put() REST Working test (overwrite)': function( test ){
      zap( function(){
  
        var req = makeReq( {  url: 'http://www.example.com/1234', headers: { 'if-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
        (g.people.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 412 );
          test.equal( data.message, 'Precondition Failed' );
  
                
          g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, function( err ){
  
            var req = makeReq( {  url: 'http://www.example.com/1234', headers: { 'if-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
            (g.people.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );
              var res = this;
  
              test.equal( type, 'json' );
              test.equal( status, 200 );
              test.equal( headers.Location, 'http://www.example.com/1234' );
              test.equal( data.name, 'Tony' );
              test.equal( data.surname, 'Mobily' );
              test.ok( data.id );
  
              zap( function(){
  
                var req = makeReq( {  url: 'http://www.example.com/1234', headers: { 'if-none-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
                (g.people.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
                  test.ifError( err );
                  var res = this;
  
                  test.equal( type, 'json' );
                  test.equal( status, 201 );
                  test.equal( headers.Location, 'http://www.example.com/1234' );
                  test.equal( data.name, 'Tony' );
                  test.equal( data.surname, 'Mobily' );
                  test.ok( data.id );
  
  
                  var req = makeReq( {  url: 'http://www.example.com/1234', headers: { 'if-none-match': '*' }, params: { id: 1234 }, body: { id: 1235, name: 'Tony', surname: 'Mobily' } } );
                  (g.people.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
                    test.ifError( err );
                    var res = this;
  
                    test.equal( type, 'bytes' );
                    test.equal( status, 412 );
                    test.equal( data.message, 'Precondition Failed' );
  
                    test.done();
                  }));
                }));
              });
            }));
          });
        }));
      });
    },
  
    'Put() REST handlePut': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          handlePut: false,
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        var req = makeReq( {  url: 'http://www.example.com/1234', params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
        (people2.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
          test.equal( type, 'bytes' );
          test.equal( status, 501 );
  
          test.done();
        }));
      });
    },
  
    'Put() REST checkParamIds': function( test ){
      zap( function(){
  
        var req = makeReq( {  url: 'http://www.example.com/1234', params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
        (g.wsPeople.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 400 );
          test.deepEqual( data,
  
  { message: 'Bad Request',
  errors: 
   [ { field: 'workspaceId',
       message: 'Field required in the URL: workspaceId' } ] }
                );
   
          test.done();
        }));
      });
    },
  
    'Put() APIh prepareBody (put)': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          prepareBody: function( request, body, method, done ){
            if( method === 'put' ){
              body.name = body.name.toUpperCase();
            }
            done( null );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();

        var p = { id: 1234, name: 'Tony', surname: "Mobily", age: 37 };
        people2.apiPut( null, p, function( err, person ){
          test.ifError( err );
          test.equal( person.name, "TONY" );
          test.equal( person.surname, "Mobily" );

          test.done();
        });
      });
    },
  
    'Put() APIg validate': function( test ){
      zap( function(){
  
        var p = { name: 'Tony', surname: "1234567890123456789012", age: 37 };
        g.people.apiPut( 1234, p, function( err, person ){
  
          test.deepEqual( err.errors, [ { field: 'surname', message: 'Field is too long: surname' } ] );
          test.equal( err.message, 'Unprocessable Entity' );
          test.equal( err.httpError, 422 );
  
          test.done();
        });
      });
    },
  
   
    'Put() NEW REST checkPermissionsPutNew': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          checkPermissionsPutNew: function( request, cb ){
            if( request.body.name === 'TONY' ) cb( null, false );
            else cb( null, true );
          },  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        var req = makeReq( { params: { id: 1234 }, body: { name: 'TONY', surname: 'Mobily' } } );
        (people2.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 403 );
          test.done();
   
        }));
      });
    },
  
    'Put() NEW APIg cleanup': function( test ){
      zap( function(){
  
        var p = { id: 1234, name: "Tony", age: 37, extra: "Won't be saved" }; 
        g.people.apiPut( null, p, function( err, person ){
          test.ifError( err );
          test.deepEqual( person, { name: 'Tony', age: 37, id: person.id } ); 
          test.done();
        });
      });
    },
  
    'Put() NEW APIh extrapolateDoc': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          extrapolateDoc: function( request, fullDoc, done ){
  
            var doc = {};
            for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
            doc.name = doc.name + '_extrapolateDoc';
            doc.age = doc.age.toString();
            done( null, doc );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
  
        people2.apiPut( 1234, { name: "Tony", age: 37 }, function( err, person ){
          test.ifError( err );
  
          test.equal( person.name, 'Tony_extrapolateDoc' );
          test.equal( person.age, 37 );
   
          test.done();
        });
      });
    },
  
    /*
    'Put() NEW APIg castDoc': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          extrapolateDoc: function( request, fullDoc, done ){
  
            var doc = {};
            for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
            doc.age = doc.age.toString();
            done( null, doc );
          }
        });
  
  
        people2.apiPut( 1234, { name: "Tony", age: 37 }, function( err, person ){
          test.ifError( err );
          test.equal( person.age, 37 );
  
          test.done();
        });
      });
  
    },
    */
  
    'Put() NEW REST echoAfterPutNew': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          echoAfterPost: false
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
        (people2.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 201 );
          test.equal( data, '' );
  
          test.done();
        }))
      });
    },
  
    'Put() NEW APIh prepareBeforeSend': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          prepareBeforeSend: function( request, doc, done ){
            doc.beforeSend = '_prepareBeforeSend';
  
            done( null );
          },
  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        // Set the basic stores
        people2.apiPut( 1234, { name: "Tony" }, function( err, person ){
          test.ifError( err );
          test.deepEqual( person,
  
  { name: 'Tony',
  id: person.id,
  beforeSend: '_prepareBeforeSend' }
  
          );
          test.done();
        });
  
      });
    },
  
    'Put() NEW REST prepareBeforeSend (if echoAfterPutNew)': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          prepareBeforeSend: function( request, doc, done ){
            doc.beforeSend = '_prepareBeforeSend';
  
            done( null );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( {  url: 'http://www.example.com/1234', params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
        (people2.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'json' );
          test.equal( status, 201 );
          test.equal( headers.Location, 'http://www.example.com/' + data.id );
          test.equal( data.name, 'Tony' );
          test.equal( data.surname, 'Mobily' );
          test.equal( data.beforeSend, '_prepareBeforeSend' );
          test.ok( data.id );
  
          test.done();
        }));
      });
    },
  
    'Put() NEW APIh afterPutNew': function( test ){
      zap( function(){
  
        var flag = false;
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          afterPutNew: function( request, doc, fullDoc, overwrite, done){
            flag = true;
            done( null );
          },
  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        // Set the basic stores
        people2.apiPut( 1234, { name: "Tony" }, function( err, person ){
          test.ifError( err );
          test.equal( flag, true );
  
          test.done();
        });
      });
    },
  
    'Put() NEW REST afterPutNew': function( test ){
      zap( function(){
  
        var flag = false;
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

   
          afterPutNew: function( request, doc, fullDoc, overwrite, done ){
            flag = true;
            done( null );
          },
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
        (people2.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( flag, true );
          test.equal( status, 201 );
  
          test.done();
        }));
      });
    },
  
  
    'Put() EXISTING APIh (+)extrapolateDoc': function( test ){
      zap( function(){
  
        // This test is done within (+)castDoc        
        test.done();
      });
    },
  
    /*
    'Put() EXISTING APIg (+)castDoc': function( test ){
      zap( function(){
  
        var ageAtFirstExtrapolateDocs;
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          extrapolateDoc: function( request, fullDoc, done ){
            if( ! People2.onlyOnce ){
              People2.onlyOnce = true;
              ageAtFirstExtrapolateDocs = fullDoc.age;
            }
            done( null, fullDoc );
          }
        });
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: '37' }, { multi: true }, function( err ){
          test.ifError( err );
  
          people2.apiPut( 1234, { name: 'Tony', age: 38, extra: 'EXTRA' }, function( err, person ){
            test.ifError( err );
            test.equal( typeof ageAtFirstExtrapolateDocs, 'string' );
            test.equal( typeof person.age, 'number' );
  
            test.done();
          });
        });
      });
    },
    */  

    'Put() EXISTING REST checkPermissionsPutExisting': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

            checkPermissionsPutExisting: function(  request, doc, fullDoc, cb ){
              if( request.body.name === 'TONY' ) cb( null, false );
              else cb( null, true );
            },  
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
   
          var req = makeReq( { params: { id: 1234 }, body: { name: 'TONY' } } );
          (people2.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 403 );
            test.done();
          }));
        })
  
      });
    },
  
    'Put() EXISTING APIg cleanup': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          g.people.apiPut( 1234, { name: 'Tony', age: 38, extra: 'EXTRA' }, function( err, person ){
            test.ifError( err );
            test.equal( typeof( person.extra ), 'undefined' );
  
            test.done();
          });
        });
      });
    },
  
    'Put() EXISTING APIh extrapolateDoc': function( test ){
      zap( function(){
  
        var firstTimeRun = true;
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          extrapolateDoc: function( request, fullDoc, done ){
  
            var doc = {};
            for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
  
            if( People2.firstTimeRun ){
              People2.firstTimeRun = false;
            } else {
              doc.age ++;
            }
            done( null, doc );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          people2.apiPut( 1234, { name: 'Tony', age: 37 }, function( err, person ){
            test.ifError( err );
  
            test.equal( person.age, 38 );
  
            test.done();
          });
        });
      });
    },
  
    /*
    'Put() EXISTING APIg castDoc': function( test ){
      zap( function(){
  
        // Not really testable
  
        test.done();
      });
    },
    */
  
    'Put() EXISTING REST echoAfterPutExisting': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

            echoAfterPost: false
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
  
          var req = makeReq( { body: { name: 'Tony', surname: 'Mobily' } } );
          (people2.getRequestHandler('Post'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 201 );
            test.equal( data, '' );
  
            test.done();
          }))
        })
      });
  
    },
  
    'Put() EXISTING APIh prepareBeforeSend': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

            prepareBeforeSend: function( request, doc, done ){
              doc.beforeSend = '_prepareBeforeSend';

              done( null );
            },
  
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
   
          // Set the basic stores
          people2.apiPut( 1234, { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.deepEqual( person,
  
  { name: 'Tony',
  id: person.id,
  beforeSend: '_prepareBeforeSend' }
  
            );
   
            test.done();
          });
        });
      });
    },
  
    'Put() EXISTING REST prepareBeforeSend  (if echoAfterPutExisting)': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

   
            prepareBeforeSend: function( request, doc, done ){
              doc.beforeSend = '_prepareBeforeSend';

              done( null );
            }
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
  
          var req = makeReq( {  url: 'http://www.example.com/1234', params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
          (people2.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'json' );
            test.equal( status, 200 );
            test.equal( headers.Location, 'http://www.example.com/1234' );
            test.equal( data.name, 'Tony' );
            test.equal( data.surname, 'Mobily' );
            test.equal( data.beforeSend, '_prepareBeforeSend' );
            test.ok( data.id );
  
            test.done();
          }));
        });
      });
    },
  
    'Put() EXISTING APIh afterPutExisting': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var flag = false;
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

   
            afterPutExisting: function( request, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
              flag = true;
              cb( null );
            },
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
  
          // Set the basic stores
          people2.apiPut( 1234, { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.equal( flag, true );
            test.done();
          });
        });
      });
    },
  
    'Put() EXISTING REST afterPutExisting': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var flag = false;
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

   
            afterPutExisting: function( request, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
              flag = true;
              cb( null );
            },
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
  
          var req = makeReq( { params: { id: 1234 }, body: { name: 'Tony', surname: 'Mobily' } } );
          (people2.getRequestHandler('Put'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( flag, true );
            test.equal( status, 200 );
  
            test.done();
          }))
        });
  
      });
    },
  
  
  
    // *********************************
    // ********** GET ******************
    // *********************************
    /*
       * REST  handleGet
       * REST  checkParamIds
       * APIh  extrapolateDoc
       * APIg  castDoc
       * REST  checkPermissionsGet
       * APIh prepareBeforeSend
       * APIh afterGet
    */
  
    'Get() API Working test': function( test ){
  
      zap( function(){
  
        var p = { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 };
        g.dbPeople.insert( p, function( err ){
          test.ifError( err );
  
          g.people.apiGet( 1234, function( err, person ){
            test.ifError( err );
  
            test.deepEqual( p, person );
  
            test.done();
          });
        });
  
      });
    },
  
    'Get() REST Working test': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', surname: 'Mobily', age: '37' }, function( err ){
          test.ifError( err );
  
          var req = makeReq( { params: { id: 1234 } } );
          (g.people.getRequestHandler('Get'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
            var res = this;
  
            test.equal( type, 'json' );
            test.equal( status, 200 );
            test.equal( data.name, 'Tony' );
            test.equal( data.surname, 'Mobily' );
            test.equal( data.age, 37 );
            test.equal( typeof( data.age ), 'number' );
            test.ok( data.id );
  
            test.done();
          }));
        });
   
      });
  
    },
  
  
    'Get() REST handleGet': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          handleGet: false,
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( { params: { id: 1234 } } );
        (people2.getRequestHandler('Get'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
          test.equal( type, 'bytes' );
          test.equal( status, 501 );
  
          test.done();
        }));
  
      });
  
    },
  
    'Get() REST checkParamIds': function( test ){
      zap( function(){
  
        var req = makeReq( { params: { id: 1234 } } );
        (g.wsPeople.getRequestHandler('Get'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 400 );
          test.deepEqual( data,
  
  { message: 'Bad Request',
  errors: 
   [ { field: 'workspaceId',
       message: 'Field required in the URL: workspaceId' } ] }
                );
   
          test.done();
        }));
      });
  
    },
  
    'Get() APIh extrapolateDoc': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          extrapolateDoc: function( request, fullDoc, done ){
  
            var doc = {};
            for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
            doc.age ++;
            done( null, doc );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var p = { id: 1234, name: 'Tony', age: 37 };
        g.dbPeople.insert( p, function( err ){
          test.ifError( err );
  
          people2.apiGet( 1234, function( err, person ){
            test.ifError( err );
            test.equal( person.age, 38 );
  
            test.done();
          });
        });
      });
  
    },
  
    /*
    'Get() APIg castDoc': function( test ){
      zap( function(){
  
        // Already happened with inserting age: '37' in 'Get() REST Working test'
        test.done();
      });
  
    },
    */
  
    'Get() REST checkPermissionsGet': function( test ){
      zap( function(){
  
         g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

            checkPermissionsGet: function(  request, doc, fullDoc, cb ){
              if( request.params.id === 1234 ) cb( null, false );
              else cb( null, true );
            },  
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
   
          var req = makeReq( { params: { id: 1234 } } );
          (people2.getRequestHandler('Get'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 403 );
        
            test.done();
          }));
        });
      });
  
    },
  
    'Get() APIh prepareBeforeSend': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
            prepareBeforeSend: function( request, doc, done ){
              doc.beforeSend = '_prepareBeforeSend';
  
              done( null );
            },
  
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
   
          // Set the basic stores
          people2.apiGet( 1234, { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.deepEqual( person,
  
  { name: 'Tony',
  id: person.id,
  age: 37,
  beforeSend: '_prepareBeforeSend' }
  
            );
            test.done();
          });
        });
      });
  
    },
  
    'Get() APIh afterGet': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var flag = false;
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

   
            afterPutExisting: function( request, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){
              flag = true;
              cb( null );
            },
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
  
          // Set the basic stores
          people2.apiPut( 1234, { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.equal( flag, true );
  
            test.done();
          });
        });
      });
  
    },
  
    'Get() API toughness test: invalid ID': function( test ){
      g.people.apiGet( { a: 10 }, function( err, personGet ){
        test.deepEqual( err.errors, [ { field: 'id', message: 'Error during casting' } ] );
        test.deepEqual( err.message, 'Bad Request' );
        test.deepEqual( err.httpError, 400 );
        test.done();
      });
    },
  
    'Get() API toughness test: getting non-existing data': function( test ){
  
      zap( function(){
  
        g.people.apiGet( 1234, function( err, personGet ){
          test.ok( err !== null );
  
          test.equal( personGet, null );
          test.equal( err.httpError, 404 );
  
          test.done();
        });
      });
    },
 
    /* 

    'Get() API toughness test: fetching data that fails schema': function( test ){
  
      zap( function(){
        g.people.apiPost( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person ){
          test.ifError( err );
  
          g.dbPeople.update( { conditions: { and: [ { field: 'id', type: 'eq', value: person.id  } ] } }, { surname: '1234567890123456789012' }, { deleteUnsetFields: false }, function( err, total ){
            test.ifError( err );
            test.ok( total === 1 );
  
            g.people.apiGet( person.id, function( err, personGet ){
              test.deepEqual( err.errors, [ { field: 'surname', message: 'Field is too long: surname' } ] );
              test.deepEqual( err.message, 'Unprocessable Entity' );
              test.deepEqual( err.httpError, 422 );
   
              test.done();
            });
          });
        });
      });
    },
  
    */

    'Get() API toughness test: fetching data with non-unique ids': function( test ){
  
      zap( function( err ){
  
        // Set the basic stores
        var PeopleWrongId = declare( g.People, {
          storeName: 'peopleWrongId',
          collectionName: 'people',
        });
        
        var peopleWrongId = new PeopleWrongId();

        // Forcefully setting idProperty and paramIds
        peopleWrongId.idProperty =  'surname',
        peopleWrongId.paramIds = [ 'surname' ],
  
        g.people.apiPost( { name: 'Tony', surname: "Mobily", age: 37 }, function( err, person1 ){
          test.ifError( err );
          g.people.apiPost( { name: 'Chiara', surname: "Mobily", age: 24 }, function( err, person2 ){
            test.ifError( err );
  
            peopleWrongId.apiGet( 'Mobily', function( err, person3 ){
              test.ok( typeof( err ) === 'object' );
              test.ok( err.message === 'execAllDbFetch fetched more than 1 record' );
              test.done();
            });
          });
  
        });
      });  
  
    },
  
  
  
    // *********************************
    // ********** DELETE ***************
    // *********************************
    /*
       * REST  handleDelete
       * REST  checkParamIds
       * APIh  extrapolateDoc
       * APIg  castDoc
       * REST  checkPermissionsDelete
       * APIh afterDelete
    */
  
    'Delete() API Working test': function( test ){
  
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 }, { multi: true, returnRecord: true }, function( err, person ){
          test.ifError( err );
  
          g.people.apiGet( person.id, function( err, personGet ){
            test.ifError( err );
            test.deepEqual( person, personGet );
  
            g.people.apiDelete( person.id, function( err ){
              test.ifError( err );
              
              g.dbPeople.select( { }, function( err, docs ){
                test.ifError( err );
  
                test.equals( docs.length, 0 );
  
                test.done();
              });
            });
          });
        });
      });
    },
  
    'Delete() REST Working test': function( test ){
      zap( function(){
  
        var p = { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 };
        g.dbPeople.insert( p, { multi: true, returnRecord: true }, function( err, person ){
          test.ifError( err );
  
          var req = makeReq( { params: { id: 1234 } } );
          (g.people.getRequestHandler('Delete'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 204 );
  
            g.dbPeople.select( { }, function( err, docs ){
              test.ifError( err );
  
              test.equals( docs.length, 0 );
  
              test.done();
            });
          }));
        });
      });
    },
  
  
    'Delete() REST handleDelete': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          handleDelete: false,
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( { params: { id: 1234 } } );
        (people2.getRequestHandler('Delete'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
          test.equal( type, 'bytes' );
          test.equal( status, 501 );
  
          test.done();
        }));
      });
  
    },
  
    'Delete() REST checkParamIds': function( test ){
      zap( function(){
  
        var req = makeReq( { params: { id: 1234 } } );
        (g.wsPeople.getRequestHandler('Get'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 400 );
          test.deepEqual( data,
  
  { message: 'Bad Request',
  errors: 
   [ { field: 'workspaceId',
       message: 'Field required in the URL: workspaceId' } ] }
                );
          test.done();
        }));
   
      });
  
    },
  
    'Delete() APIh extrapolateDoc': function( test ){
      zap( function(){
  
        var extrapolatedSurname = {};
        var ageBeforeCast;
  
        var p = { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 };
        g.dbPeople.insert( p, { multi: true, returnRecord: true, skipValidation: true }, function( err, person ){
          test.ifError( err );
  
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
            extrapolateDoc: function( request, fullDoc, done ){
  
              var doc = {};
              for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
              doc.surname += '_extrapolated';
              extrapolatedSurname = doc.surname;
  
              done( null, doc );
            }
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
  
          people2.apiDelete( 1234, function( err, person ){
            test.ifError( err );
            test.equal( extrapolatedSurname, 'Mobily_extrapolated' );
  
            test.done();
          });
        });
      });
  
    },
  
    /*
    'Delete() APIg castDoc': function( test ){
      zap( function(){
  
        // Already tested in 'Delete() APIh extrapolateDoc' with age: '37'
        test.done();
      });
  
    },
    */
  
    'Delete() REST checkPermissionsDelete': function( test ){
      zap( function(){
  
         g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

            checkPermissionsDelete: function(  request, doc, fullDoc, cb ){
              if( request.params.id === 1234 ) cb( null, false );
              else cb( null, true );
            },  
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
   
          var req = makeReq( { params: { id: 1234 } } );
          (people2.getRequestHandler('Delete'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );
  
            var res = this;
  
            test.equal( type, 'bytes' );
            test.equal( status, 403 );
        
            test.done();
          }));
        });
   
      });
  
    },
  
    'Delete() APIh afterDelete': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var flag = false;
          var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
            afterDelete: function( request, doc, fullDoc, cb ){
              flag = true;
              cb( null );
            },
          });
          People2.deleteStore( 'people2' );
        var people2 = new People2();
  
          // Set the basic stores
          people2.apiDelete( 1234, { name: "Tony" }, function( err, person ){
            test.ifError( err );
            test.equal( flag, true );
  
            test.done();
          });
        });
      });
  
    },
  
    'API Delete() toughness test: deleting non-existing data': function( test ){
  
      zap( function(){
  
        g.people.apiDelete( 1234, function( err, total ){
          test.ok( err !== null );
          test.equal( err.httpError, 404 );
  
          test.done();
        });
  
      });
    },
  
    // *********************************
    // ********** GETQUERY ***************
    // *********************************
    /*
       * REST handleGetQuery
       * REST checkParamIds
       * REST checkPermissionsGetQuery
       * APIg validate
       * APIg extrapolateDoc
       * APIg castDoc
       * APIg prepareBeforeSend
    */
  
    'GetQuery() API Working test -- filters': function( test ){
      zap( function(){
  
        var l = [];
        async.series([
          function( done ){ g.people.apiPost( { name: 'Tony', surname: "Mobily", age: 37 },    function( err, r ){ l.push( r); done() }) },
          function( done ){ g.people.apiPost( { name: 'Chiara', surname: "Mobily", age: 24 },  function( err, r ){ l.push( r); done() }) },
          function( done ){ g.people.apiPost( { name: 'Daniela', surname: "Mobily", age: 64 }, function( err, r ){ l.push( r); done() }) },
          function( done ){ g.people.apiPost( { name: 'Sara', surname: "Fabbietti", age: 14 }, function( err, r ){             done() }) },
        ], function( err ){
          test.ifError( err );
          
          g.people.apiGetQuery( { filters: { nameSt: 'Mo' } }, function( err, docs ){
            test.ifError( err );

            compareCollections( test, l, docs );
 
            g.people.apiGetQuery( { filters: { ageGt: 20 } }, function( err, docs ){
              test.ifError( err );
              compareCollections( test, l, docs );
  
              test.done();
            });
          });
        });
      });
    },
  
    'GetQuery() API Working test -- sorting': function( test ){
      zap( function(){
  
        async.series([
          function( done ){ g.people.apiPut( 1234, { id: 1234, name: 'Tony', surname: "Mobily", age: 37 },    function( err, r ){ done( err ) }) },
          function( done ){ g.people.apiPut( 1235, { id: 1235, name: 'Chiara', surname: "Mobily", age: 24 },  function( err, r ){ done( err ) }) },
          function( done ){ g.people.apiPut( 1236, { id: 1236, name: 'Daniela', surname: "Mobily", age: 64 }, function( err, r ){ done( err ) }) },
          function( done ){ g.people.apiPut( 1237, { id: 1237, name: 'Sara', surname: "Fabbietti", age: 14 }, function( err, r ){ done( err ) }) },
        ], function( err ){
          test.ifError( err );

          g.people.apiGetQuery( { sort: { age: 1 } }, function( err, docs ){
            test.ifError( err );
  
            test.deepEqual( docs,
  
  [ { id: 1237, name: 'Sara', surname: 'Fabbietti', age: 14 },
  { id: 1235, name: 'Chiara', surname: 'Mobily', age: 24 },
  { id: 1234, name: 'Tony', surname: 'Mobily', age: 37 },
  { id: 1236, name: 'Daniela', surname: 'Mobily', age: 64 } ]
  
            );
 
            test.done();
          });
        });
      });
    },
  
    'GetQuery() API Working test -- limit': function( test ){
      zap( function(){
  
        async.series([
          function( done ){ g.people.apiPut( 1234, { name: 'Tony', surname: "Mobily", age: 37 },    function( err, r ){ done( err ) }) },
          function( done ){ g.people.apiPut( 1235, { name: 'Chiara', surname: "Mobily", age: 24 },  function( err, r ){ done( err ) }) },
          function( done ){ g.people.apiPut( 1236, { name: 'Daniela', surname: "Mobily", age: 64 }, function( err, r ){ done( err ) }) },
          function( done ){ g.people.apiPut( 1237, { name: 'Sara', surname: "Fabbietti", age: 14 }, function( err, r ){ done( err ) }) },
        ], function( err ){
          test.ifError( err );
          
          g.people.apiGetQuery( { sort: { age: 1 }, ranges: { limit: 1 } }, function( err, docs ){
            test.ifError( err );
  
            test.deepEqual( docs,
  
  [ { id: 1237, name: 'Sara', surname: 'Fabbietti', age: 14 } ]
  
            );
  
            test.done();
          });
        });
      });
    },

    'GetQuery() REST Working test (filters and ranges)': function( test ){
      zap( function(){
  
        async.series([
          function( done ){ g.people.apiPost( { name: 'Tony', surname: "Mobily", age: 37 },    function( err, r ){ done() }) },
          function( done ){ g.people.apiPost( { name: 'Chiara', surname: "Mobily", age: 24 },  function( err, r ){ done() }) },
          function( done ){ g.people.apiPost( { name: 'Daniela', surname: "Mobily", age: 64 }, function( err, r ){ done() }) },
          function( done ){ g.people.apiPost( { name: 'Sara', surname: "Fabbietti", age: 14 }, function( err, r ){ done() }) },
        ], function( err ){
          test.ifError( err );
        
          // var req = makeReq( { url: "http://www.example.org/people?ageGt=90", headers: { range: 'items=1-12' } } );
          var req = makeReq( { url: "http://www.example.org/people/", headers: { range: 'items=1-2' } } );

          (g.people.getRequestHandler('GetQuery'))(req, new RES( function( err, type, headers, status, data ){
            test.ifError( err );

            test.equal( type, 'json' );
            test.equal( data.length, 2 );
            test.equal( headers['Content-Range'], 'items 1-2/4');
            test.equal( status, 200);


            var req = makeReq( { url: "http://www.example.org/people/?ageGt=90", headers: { range: 'items=1-2' } } );

            (g.people.getRequestHandler('GetQuery'))(req, new RES( function( err, type, headers, status, data ){
              test.ifError( err );

              test.equal( type, 'json' );
              test.equal( data.length, 0 );
              test.equal( headers['Content-Range'], 'items 0-0/0');
              test.equal( status, 200);

              var req = makeReq( { url: "http://www.example.org/people/", headers: { range: 'items=1-20' } } );

              (g.people.getRequestHandler('GetQuery'))(req, new RES( function( err, type, headers, status, data ){
                test.ifError( err );

                test.equal( type, 'json' );
                test.equal( data.length, 3 );
                test.equal( headers['Content-Range'], 'items 1-3/4');
                test.equal( status, 200);
 
                //console.log( err, type, headers, status, data );

                test.done();

              }));
            }));
          }));
 
        });
      });
    },
  
    'GetQuery() REST handleGetQuery': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          handleGetQuery: false,
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( { params: { id: 1234 } } );
        (people2.getRequestHandler('GetQuery'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
          test.equal( type, 'bytes' );
          test.equal( status, 501 );
  
          test.done();
        }));
      });
  
    },
  
    'GetQuery() REST checkParamIds': function( test ){
      zap( function(){
  
        var req = makeReq( { params: { id: 1234 } } );
        (g.wsPeople.getRequestHandler('Get'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 400 );
          test.deepEqual( data,
  
  { message: 'Bad Request',
  errors: 
   [ { field: 'workspaceId',
       message: 'Field required in the URL: workspaceId' } ] }
  
          );
          test.done();
        }));
   
      });
  
    },
  
    'GetQuery() REST checkPermissionsGetQuery': function( test ){
      zap( function(){
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          checkPermissionsGetQuery: function(  request, cb ){
            if( request.options.filters.name === 'Tony' ) cb( null, false );
            else cb( null, true );
          },  
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        var req = makeReq( { url: "http://www.example.org/people/?name=Tony&surname=Mobily" } );
        (people2.getRequestHandler('GetQuery'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 403 );
  
          test.done();
        }));
      });
  
    },
  
    'GetQuery() APIg validate': function( test ){
      zap( function(){
  
        var req = makeReq( { url: "http://www.example.org/people/?name=Tony&surname=1234567890123456789012" } );
        (g.people.getRequestHandler('GetQuery'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
  
          test.equal( type, 'bytes' );
          test.equal( status, 400 );
          test.deepEqual( data,
  
  { message: 'Bad Request',
  errors: [ { field: 'surname', message: 'Field is too long: surname' } ] }
          );
  
          test.done();
        }));
      });
  
    },
  
    'GetQuery() APIg extrapolateDoc': function( test ){
      zap( function(){
  
        var l = [];
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

  
          extrapolateDoc: function( request, fullDoc, done ){
  
            var doc = {};
            for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
            doc.surname += '_extrapolated';
  
            done( null, doc );
          }
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        // NOTE! The age is '37', and then `r` is corrected to 37 for comparison.
        async.series([
          function( done ){ g.dbPeople.insert( { id: 1234, name: 'Tony', surname: "Mobily", age: 37 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err ); r.surname += "_extrapolated"; l.push( r ); done() }) },
          function( done ){ g.dbPeople.insert( { id: 1235, name: 'Chiara', surname: "Mobily", age: 24 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err ); r.surname += "_extrapolated"; l.push( r ); done() }) },
          function( done ){ g.dbPeople.insert( { id: 1236, name: 'Daniela', surname: "Mobily", age: 64 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err ); r.surname += "_extrapolated"; l.push( r ); done() }) },
          function( done ){ g.dbPeople.insert( { id: 1237, name: 'Sara', surname: "Fabbietti", age: 14 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err ); done() }) },
        ], function( err ){

          test.ifError( err );

           people2.apiGetQuery( { filters: { nameSt: 'Mo' } }, function( err, docs ){
            test.ifError( err );
  
            compareCollections( test, l, docs );
   
            test.done();
          });
        });
      });
  
    },
  
    /*
    'GetQuery() APIg castDoc': function( test ){
      zap( function(){
  
        // Already tested in 'GetQuery() APIg extrapolateDoc'
        test.done();
      });
  
    },
    */
  
    'GetQuery() APIg prepareBeforeSend': function( test ){
      zap( function(){
  
        var l = [];
  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',

          prepareBeforeSend: function( request, doc, done ){
           doc.prepared = 10;

           done( null );
          },
        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
   
        async.series([
          function( done ){ g.dbPeople.insert( { id: 1234, name: 'Tony', surname: "Mobily", age: 37 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err ); r.prepared = 10; l.push( r ); done() }) },
          function( done ){ g.dbPeople.insert( { id: 1235, name: 'Chiara', surname: "Mobily", age: 24 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err ); r.prepared = 10; l.push( r ); done() }) },
          function( done ){ g.dbPeople.insert( { id: 1236, name: 'Daniela', surname: "Mobily", age: 64 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err ); r.prepared = 10; l.push( r ); done() }) },
          function( done ){ g.dbPeople.insert( { id: 1237, name: 'Sara', surname: "Fabbietti", age: 14 }, { returnRecord: true }, function( err, r ){ if( err ) return done( err );             done() }) },
        ], function( err ){
          test.ifError( err );
  
           people2.apiGetQuery( { filters: { nameSt: 'Mo' } }, function( err, docs ){
            test.ifError( err );
  

            compareCollections( test, l, docs );
   
            test.done();
          });
        });
      });
  
    },
  
  
    'testing _queryMakeSelector': function( test ){
  
       g.people._queryMakeSelector( true, { name: 'Tony', surname: 'Mobily' }, {}, {}, function( err, selector ){

         test.ifError( err );
         test.deepEqual( selector,
  
  { conditions: 
   { and: 
      [ { field: 'name', type: 'eq', value: 'Tony' },
        { field: 'surname', type: 'eq', value: 'Mobily' } ] },
  ranges: {},
  sort: {}  }
         );
      
         g.people._queryMakeSelector( true, { nameSt: 'Mob', ageGt: 20 }, {}, {}, function( err, selector) {

           test.ifError( err );
           test.deepEqual( selector,
  
  { conditions: 
   { and: 
      [ { field: 'surname', type: 'startsWith', value: 'Mob' },
        { field: 'age', type: 'gt', value: 20 } ] },
  ranges: {},
  sort: {}  }
  
           );
  
           g.people._queryMakeSelector( true, { name: 'Tony' }, { name: -1, surname: 1 }, {}, function( err, selector ){
  
             test.ifError( err );
             test.deepEqual( selector, 
  
  { conditions: { and: [ { field: 'name', type: 'eq', value: 'Tony' } ] },
  ranges: {},
  sort: { name: -1, surname: 1 } }
  
             );
  
             var selector = g.people._queryMakeSelector( true, { name: 'Tony' }, { name: -1, surname: 1 }, { from: 0, to: 10, limit: 5}, function( err, selector ){
  
               test.ifError( err );
               test.deepEqual( selector, 
  
  { conditions: { and: [ { field: 'name', type: 'eq', value: 'Tony' } ] },
  ranges: { from: 0, to: 10, limit: 5 },
  sort: { name: -1, surname: 1 } }
  
               );
 
             });
           });
         });
       });
 
       test.done();
    },
  
    'testing _initOptionsFromReq for Put()': function( test ){
  
       var req = {};
       req.headers = {};
  
       req.headers[ 'if-match' ] = '*';
       var options = g.people._initOptionsFromReq( 'Put', req, true );
       test.deepEqual( options, { overwrite: true } );
  
       req.headers[ 'if-none-match' ] = '*';
       var options = g.people._initOptionsFromReq( 'Put', req, true );
       test.deepEqual( options, { overwrite: false } );
  
       req.headers = {};
       var options = g.people._initOptionsFromReq( 'Put', req, true );
       test.deepEqual( options, { } );
  
       test.done();
    }, 
  
    'testing _initOptionsFromReq for GetQuery() -- just parameters': function( test ){
  
       // Basic initialisation
       var req = {};
       req.headers = {};
  
       req.url = "http://www.example.org/people?name=Tony&surname=Mobily";
  
       var options = g.people._initOptionsFromReq( 'GetQuery', req, true );
       test.deepEqual( options, 
  
  { sort: {},
  ranges: null,
  filters: { name: 'Tony', surname: 'Mobily' } }
  
       );
       
       test.done();
    }, 
  
  
    'testing _initOptionsFromReq for GetQuery() -- sortBy': function( test ){
  
       // Basic initialisation
       var req = {};
       req.headers = {};
  
       req.url = "http://www.example.org/people?name=Tony&surname=Mobily&sortBy=+name,-surname";
  
       var options = g.people._initOptionsFromReq( 'GetQuery', req, true );
       test.deepEqual( options, 
  
  { sort: { name: 1, surname: -1 },
  ranges: null,
  filters: { name: 'Tony', surname: 'Mobily' } }
  
       );
  
       req.url = "http://www.example.org/people?name=Tony&surname=Mobily&sortBy=+name,surname";
  
       var options = g.people._initOptionsFromReq( 'GetQuery', req, true );
       test.deepEqual( options, 
  
  { sort: { name: 1 },
  ranges: null,
  filters: { name: 'Tony', surname: 'Mobily' } }
       );
  
       
       test.done();
    }, 
  
    'testing _initOptionsFromReq for GetQuery() -- ranges': function( test ){
  
       // Basic initialisation
       var req = {};
       req.headers = {};
  
       req.headers.range = "items=0-10";
       req.url = "http://www.example.org/people?name=Tony";
  
       var options = g.people._initOptionsFromReq( 'GetQuery', req, true );
       test.deepEqual( options, 
  
  { sort: {},
  ranges: { from: 0, to: 10, limit: 11 },
  filters: { name: 'Tony' } }
  
       );
  
  
       req.headers.range = "items= 0-10";
       req.url = "http://www.example.org/people?name=Tony";
  
       var options = g.people._initOptionsFromReq( 'GetQuery', req, true );
       test.deepEqual( options, 
  
  { sort: {},
  ranges: null,
  filters: { name: 'Tony' } }
  
       );
  
       test.done();
    }, 
  
  
    'testing chainErrors': function( test ){
      zap( function(){
  
        g.dbPeople.insert( { id: 1234, name: 'Tony', age: 37 }, { multi: true }, function( err ){
          test.ifError( err );
  
          var WsPeople2 = declare( g.WsPeople, {
            storeName: 'people2',
            collectionName: 'people',

            chainErrors: 'all'
          });
          WsPeople2.deleteStore( 'people2' );
          var wsPeople2 = new WsPeople2();

  
          var WsPeople3 = declare( g.People, {
            storeName: 'people3',
            collectionName: 'people',

            chainErrors: 'nonhttp',
  
            extrapolateDoc: function( request, fullDoc, cb ){
              cb( new Error("Some other error") );
            },
          });
          WsPeople3.deleteStore( 'people3' );
          var wsPeople3 = new WsPeople3();
  
          // This chains all of them
          var req = makeReq( { params: { id: 1234 } } );
          (wsPeople2.getRequestHandler('Get'))(req,
            new RES( function( err, type, headers, status, data ){
              test.equal("I should not be here", "" );
              test.done();
            }),
            function( err ){
              test.deepEqual( err.errors,
  
  [ { field: 'workspaceId',
       message: 'Field required in the URL: workspaceId' } ]
  
              );
              test.equal( err.message, 'Bad Request' );
              test.equal( err.httpError, 400 );
  
  
              // This chains all of them
              var req = makeReq( { params: { id: 1234 } } );
              (wsPeople3.getRequestHandler('Get'))(req,
                new RES( function( err, type, headers, status, data ){

                  test.equal("I should not be here", "" );
  
                  test.done();
  
                }),
                function( err ){
  
                  test.equal( err.message, "Some other error" );
                  test.done();
  
                }
              );
  
            }
          );
  
        });
      }); 
    },

    'Testing that logError gets fired': function( test ){
      zap( function(){

        var errorLogged = false;  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',


          handleDelete: false,

          logError: function(){
            errorLogged = true;
          },

        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( { params: { id: 1234 } } );
        (people2.getRequestHandler('Delete'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
          test.equal( type, 'bytes' );
          test.equal( status, 501 );
          process.nextTick( function(){
            test.equal( errorLogged, true ); 
            test.done();
          });
        }));
      });
  
    },
 
    'Testing that formatError is used': function( test ){
      zap( function(){

        var errorLogged = false;  
        var People2 = declare( g.People, {
          storeName: 'people2',
          collectionName: 'people',


          handleDelete: false,

          formatErrorResponse: function( error ){

            if( error.errors ){
              return { message: error.message, errors: error.errors, custom: true }
            } else {
              return { message: error.message, custom: true }
            }
          },

        });
        People2.deleteStore( 'people2' );
        var people2 = new People2();
  
        var req = makeReq( { params: { id: 1234 } } );
        (people2.getRequestHandler('Delete'))(req, new RES( function( err, type, headers, status, data ){
          test.ifError( err );
  
          var res = this;
          test.equal( type, 'bytes' );
          test.equal( status, 501 );
          test.equal( data.custom, true );
          test.done();
        }));
      });
  
    },
 

  }

  tests.finish = finish;

  return tests;
}



