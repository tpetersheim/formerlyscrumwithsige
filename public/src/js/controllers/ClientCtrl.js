/**
 * Created by Nick Largent on 5/19/14.
 */

angular.module('ScrumWithSige').controller('ClientCtrl', ['$scope', '$location', '$cookieStore', '$sce', 'socket', 'tools', function ($scope, $location, $cookieStore, $sce, socket, tools) {

    var getUser = function() {
        var uid = $cookieStore.get('uid');
        if (uid)
            return uid;
        uid = tools.generateUserId();
        $cookieStore.put('uid', uid);
        return uid;
    };

    var sid = $location.search().session;
    if (sid) {
        sid = sid.toLowerCase();
    }

    var model = {
        uid: getUser(),
        sid: sid,
        qrcodeUrl: '/qrcode?size=100&url=' + encodeURIComponent(tools.buildJoinUrl(sid)),
        showSettings: false,
        showNameChange: false,
        showConnectCode: false,
        newUsername: '',
        connected: false,
        loggedIn: false,
        transport: 'unknown',
        username: $cookieStore.get('username') || '',
        isLoggedIn: function() {
            return this.username && this.username.length > 0;
        },
        vote: -1,
        settings: {
            showVoteSelection: true,
            showSharedHtml: true,
            showBackgroundImage: false,
            backgroundImage: "",
            showHostBackgroundImage: false
        },
        hostSettings: {
            cardNumbers: [],
            sharedHtml: "",
            backgroundImage: ""
        }
    };
    $scope.model = model;

    $scope.vote = function(value) {
        if (value == model.vote) {
            value = null;
        }
        model.vote = value;
        socket.emit('vote', value);
    };


    $scope.showConnectCode = function() {
        model.showConnectCode = !model.showConnectCode;
    };

    $scope.saveSettings = function () {
        model.showSettings = false;
       $scope.writeSettings();
    };

    $scope.loadSettings = function () {
        model.settings = JSON.parse(localStorage.getItem('clientSettings')) || model.settings;
    };
    $scope.loadSettings();

    $scope.writeSettings = function () {
        localStorage.setItem('clientSettings', JSON.stringify(model.settings));
    };

    $scope.getSharedHtml = function () {
        return $sce.trustAsHtml(model.hostSettings.sharedHtml);
    };

    $scope.showNameChange = function () {
        model.newUsername = model.username;
        model.showNameChange = true;
    };

    $scope.saveNameChange = function () {
        $scope.join();
        model.showNameChange = false;
    };

    $scope.getBodyBackgroundStyle = function () {
        var style = {};
        var imageUrl = "";
        if (model.settings.showBackgroundImage) {
            imageUrl = model.settings.backgroundImage;
        } else if (model.settings.showHostBackgroundImage) {
            imageUrl = model.hostSettings.backgroundImage;
        }

        if (imageUrl) {
            style = {
                'background-image': 'url(' + imageUrl + ')',
                'background-size': 'cover'
            };
        }

        return style;
    };

    $scope.getCardValue = function (value) {
        return tools.getCardValue(value, false);
    };

    $scope.showHostBackgroundChange = function () {
        if (model.settings.showHostBackgroundImage) {
            model.settings.showBackgroundImage = false;
        }
    };

    $scope.showBackgroundChange = function () {
        if (model.settings.showBackgroundImage) {
            model.settings.showHostBackgroundImage = false;
        }
    };

    socket.on('connect', function(){
        model.connected = true;
        model.transport = socket.transport();
        doJoin();
    });

    socket.on('disconnect', function() {
        model.connected = false;
        model.loggedIn = false;
    });

    socket.on('failure', function(reason) {
        model.connected = false;
        model.loggedIn = false;
        console.log(reason);
        alert(reason);
    });

    socket.on('loggedIn', function(hostSettings) {
        model.loggedIn = true;
        model.hostSettings = hostSettings;
    });

    socket.on('reset', function(mode) {
        model.vote = -1;
    });

    $scope.reset = function() {
        socket.emit("reset");
    };

    socket.on('updateSettings', function (hostSettings) {
        model.hostSettings = hostSettings;
    });

    $scope.leave = function() {
        socket.emit("leave");
        window.location = "/";
    };

    $scope.join = function() {
        model.username = model.newUsername;
        $cookieStore.put('username', model.newUsername);
        doJoin();
    };

    $scope.connectedIcon = function() {
        if (model.loggedIn)
            return "LED_on.png";
        else
            return "LED_off.png";
    };

    var doJoin = function() {
        if (model.connected && model.username) {
            socket.emit('bindUser', {sid: model.sid, uid: model.uid, username: model.username});
        }
    };
}]);