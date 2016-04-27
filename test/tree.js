var _ = require('lodash');
var Mongoose = require('mongoose');
var Promise = require('bluebird');
var Tree = require('../lib/tree');

const process = require('process');
var shortId = require('shortid');
var should = require('chai').should();

var Schema = Mongoose.Schema;


Mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mongoose-path-tree');


describe('tree tests', function () {

  var userSchema = {
    name: String
  };

  var pluginOptions = {
    pathSeparator: '.'
  };

  if (process.env.MONGOOSE_TREE_SHORTID === '1') {
    userSchema._id = {
      type: String,
      unique: true,
      'default': function(){
        return shortId.generate();
      }
    };

    pluginOptions.idType = String
  }

  // Schema for tests
  var UserSchema = new Schema(userSchema);
  UserSchema.plugin(Tree, pluginOptions);
  var User = Mongoose.model('User', UserSchema);

  // Set up the fixture
  beforeEach(function (done) {

    User.remove({}, function (err) {

      Promise.all([
        new User({ name: 'Adam' }).save(),
        new User({ name: 'Eden' }).save()
      ])
      .spread(function (adam, eden) {
        return Promise.all([
          new User({ name: 'Bob', parent: adam._id }).save(),
          new User({ name: 'Carol', parent: adam._id }).save()
        ]);
      })
      .spread(function (bob, carol) {
        return new User({ name: 'Dann', parent: carol._id }).save();
      })
      .then(function (dann) {
        return new User({ name: 'Emily', parent: dann._id }).save()
      })
      .then(function (emily) {
        done();
      });
    });
  });


  describe('adding documents', function () {

    it('should set parent', function (done) {
      User.find()
      .then(function (users) {
        var names = {};
        users.forEach(function (user) {
          names[user.name] = user;
        });
        should.not.exist(names['Adam'].parent);
        names['Bob'].parent.toString().should.equal(names['Adam']._id.toString());
        names['Carol'].parent.toString().should.equal(names['Adam']._id.toString());
        names['Dann'].parent.toString().should.equal(names['Carol']._id.toString());
        names['Emily'].parent.toString().should.equal(names['Dann']._id.toString());
        done();
      });
    });

    it('should set path', function (done) {
      User.find()
      .then(function (users) {
        var names = {};
        users.forEach(function (user) {
          names[user.name] = user;
        });
        var expectedPath = [names['Adam']._id, names['Carol']._id, names['Dann']._id, names['Emily']._id].join('.');
        names['Emily'].path.should.equal(expectedPath);
        done();
      });
    });

  });

  describe('updating document', function() {

    it('should update parent', function (done) {
      Promise.all([
        User.findOne({ name: 'Bob' }),
        User.findOne({ name: 'Emily' })
      ])
      .spread(function (bob, emily) {
        bob.parent = emily._id;
        return Promise.all([
          bob.save(),
          emily._id
        ]);
      })
      .spread(function (newBob, emilyId) {
        newBob.parent.toString().should.eql(emilyId.toString());
        done();
      });
    });

    it('should update path', function (done) {
      Promise.all([
        User.findOne({ name: 'Bob' }),
        User.findOne({ name: 'Emily' })
      ])
      .spread(function (bob, emily) {
        bob.parent = emily._id;
        return Promise.all([
          bob.save(),
          emily.path
        ]);
      })
      .spread(function (newBob, emilyPath) {
        var expectedPath = [emilyPath, newBob._id.toString()].join('.');
        newBob.path.should.eql(expectedPath);
        done();
      });
    });

    it('should keep parent for leaf nodes', function (done) {
      Promise.all([
        User.findOne({ name: 'Bob' }),
        User.findOne({ name: 'Carol' })
      ])
      .spread(function (bob, carol) {
        carol.parent = bob._id;
        return carol.save();
      })
      .then(function (newCarol) {
        return Promise.all([
          User.findOne({ name: 'Dann' }),
          User.findOne({ name: 'Emily' }),
          newCarol
        ])
      })
      .spread(function (dann, emily, carol) {
        dann.parent.toString().should.eql(carol._id.toString());
        done();
      });
    });

    it('should update path for all leaf nodes', function (done) {
      Promise.all([
        User.findOne({ name: 'Bob' }),
        User.findOne({ name: 'Carol' })
      ])
      .spread(function (bob, carol) {
        carol.parent = bob._id;
        return carol.save();
      })
      .then(function (newCarol) {
        return Promise.all([
          User.findOne({ name: 'Dann' }),
          User.findOne({ name: 'Emily' }),
          newCarol
        ])
      })
      .spread(function (dann, emily, carol) {
        var expectedPathForDann = [carol.path, dann._id.toString()].join('.');
        var expectedPathForEmily = [dann.path, emily._id.toString()].join('.');
        dann.path.should.eql(expectedPathForDann);
        emily.path.should.eql(expectedPathForEmily);
        done();
      });
    });

  });


  describe('removing document', function () {

    it('should remove leaf nodes', function (done) {
      User.findOne({ name: 'Emily' })
      .then(function (emily) {
        return emily.remove();
      })
      .then(function (status) {
        return User.find();
      })
      .then(function (users) {
        users.length.should.eql(5);
        _.map(users, 'name').should.not.include('Emily');
        done();
      });
    });

    it('should remove all children', function (done) {
      User.findOne({ name: 'Carol' })
      .then(function (carol) {
        return carol.remove();
      })
      .then(function (status) {
        return User.find();
      })
      .then(function (users) {
        users.length.should.equal(3);
        _.map(users, 'name').should.include('Adam');
        _.map(users, 'name').should.include('Bob');
        done();
      });
    });

  });

  describe('get children', function () {

    it('should return immediate children with filters', function (done) {
      User.findOne({ name: 'Adam' })
      .then(function (adam) {
        return adam.getChildren({ name: 'Bob' });
      })
      .then(function (users) {
        users.length.should.equal(1);
        _.map(users, 'name').should.include('Bob');
        done();
      });
    });

    it('should return immediate children', function (done) {
      User.findOne({name: 'Adam'})
      .then(function (adam) {
        return adam.getChildren();
      })
      .then(function (users) {
        users.length.should.equal(2);
        _.map(users, 'name').should.include('Bob');
        _.map(users, 'name').should.include('Carol');
        done();
      });
    });

    it('should return recursive children', function (done) {
      User.findOne({ 'name': 'Carol' })
      .then(function (carol) {
        return carol.getChildren(true);
      })
      .then(function (users) {
        users.length.should.equal(2);
        _.map(users, 'name').should.include('Dann');
        _.map(users, 'name').should.include('Emily');
        done();
      });
    });

    it('should return children with only name and _id fields', function (done) {
      User.findOne({ 'name': 'Carol' })
      .then(function (carol) {
        return carol.getChildren({}, 'name', true);
      })
      .then(function (users) {
        users.length.should.equal(2);
        _.map(users, 'name').should.include('Dann');
        _.map(users, 'name').should.include('Emily');
        done();
      })
    });

    it('should return children sorted on name', function (done) {
      User.findOne({ 'name': 'Carol' })
      .then(function (carol) {
        return carol.getChildren({}, null, {sort: {name: -1}}, true);
      })
      .then(function (users) {
        users.length.should.equal(2);
        users[0].name.should.equal('Emily');
        _.map(users, 'name').should.include('Dann').and.include('Emily');
        done();
      });
    });

  });


  describe('level virtual', function () {

    it('should equal the number of ancestors', function (done) {
      User.findOne({ 'name': 'Dann' })
      .then(function (dann) {
        dann.level.should.equal(3);
        done();
      });
    });

  });


  describe('get ancestors', function () {

    it('should return ancestors', function (done) {
      User.findOne({ 'name': 'Dann' })
      .then(function (dann) {
        return dann.getAncestors();
      })
      .then(function (ancestors) {
        ancestors.length.should.equal(2);
        _.map(ancestors, 'name').should.include('Carol');
        _.map(ancestors, 'name').should.include('Adam');
        done();
      });
    });


    it('should return ancestors with only name and _id fields', function (done) {

      User.findOne({ 'name': 'Dann' })
      .then(function (dann) {
        return dann.getAncestors({}, 'name');
      })
      .then(function (ancestors) {
        ancestors.length.should.equal(2);
        should.not.exist(ancestors[0].parent);
        ancestors[0].name.should.not.be.null;
        _.map(ancestors, 'name').should.include('Adam');
        _.map(ancestors, 'name').should.include('Carol');
        done();
      });
    });


    it('should return ancestors sorted on name and without wrappers', function (done) {
      User.findOne({ 'name': 'Dann' })
      .then(function (dann) {
        return dann.getAncestors({}, null, {sort: {name: -1}, lean: 1});
      })
      .then(function (ancestors) {
        ancestors.length.should.equal(2);
        ancestors[0].name.should.equal('Carol');
        should.not.exist(ancestors[0].getAncestors);
        _.map(ancestors, 'name').should.include('Carol');
        _.map(ancestors, 'name').should.include('Adam');
        done();
      });
    });
  });


  describe.skip('get children tree', function () {

    it("should return complete children tree", function (done) {

      User.getChildrenTree(function (err, childrenTree) {

        should.not.exist(err);
        childrenTree.length.should.equal(2);

        var adamTree = _.find(childrenTree, function(x){ return x.name == 'Adam'});
        var edenTree = _.find(childrenTree, function(x){ return x.name == 'Eden'});

        var bobTree = _.find(adamTree.children, function(x){ return x.name == 'Bob'});

        var carolTree = _.find(adamTree.children, function(x){ return x.name == 'Carol'});
        var danTree = _.find(carolTree.children, function(x){ return x.name == 'Dann'});
        var emilyTree = _.find(danTree.children, function(x){ return x.name == 'Emily'});


        adamTree.children.length.should.equal(2);
        edenTree.children.length.should.equal(0);

        bobTree.children.length.should.equal(0);

        carolTree.children.length.should.equal(1);

        danTree.children.length.should.equal(1);
        danTree.children[0].name.should.equal('Emily');

        emilyTree.children.length.should.equal(0);
        done();
      });
    });

    it("should return adam's children tree", function (done) {

      User.findOne({ 'name': 'Adam' }, function (err, adam) {

        adam.getChildrenTree(function (err, childrenTree) {

          should.not.exist(err);

          var bobTree = _.find(childrenTree, function(x){ return x.name == 'Bob'});

          var carolTree = _.find(childrenTree, function(x){ return x.name == 'Carol'});
          var danTree = _.find(carolTree.children, function(x){ return x.name == 'Dann'});
          var emilyTree = _.find(danTree.children, function(x){ return x.name == 'Emily'});

          bobTree.children.length.should.equal(0);
          carolTree.children.length.should.equal(1);
          danTree.children.length.should.equal(1);
          danTree.children[0].name.should.equal('Emily');
          emilyTree.children.length.should.equal(0);

          done();
        });
      });
    });
  });
});
