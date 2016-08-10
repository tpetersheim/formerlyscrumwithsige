/// <reference path="../../../../_references.js" />
/**
 * Created by Nick Largent on 5/19/14.
 */

angular.module('ScrumWithSige').controller('ServerCtrl', ['$scope', '$location', '$timeout', '$cookieStore', 'socket', 'tools', function ($scope, $location, $timeout, $cookieStore, socket, tools) {

    $scope.newSession = function() {
        sid = tools.generateSessionId();
        window.location = tools.buildHostUrl(sid);
    };

    var sid =  $location.search().session;

    if (!sid) {
        sid = tools.generateSessionId();
        $location.search("session", sid);
    }
    else {
        sid = sid.toLowerCase();
    }

    var model = {
        sid: sid,
        joinUrl: tools.buildJoinUrl(sid),
        showConnectCode: true,
        qrcodeUrl: '/qrcode?size=100&url=' + encodeURIComponent(tools.buildJoinUrl(sid)),
        qrcodeUrlBig: '/qrcode?size=500&url=' + encodeURIComponent(tools.buildJoinUrl(sid)),
        users: [],
        allIn: false,
        average: 0,
        separation: 0,
        minimum: 0,
        maximum: 0,
        votesCounted: 0,
        showSettings: false,
        settings: {
            showVoteAverage: true,
            voteAverageNumDecimals: 0,
            showVoteMinimum: true,
            showVoteMaximum: true,
            showVoteSeparation: true,
            showVoteSeparationThresholdCompromised: true,
            voteSeparationThreshold: 2,
            cardNumbersString: "",
            cardNumbers: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, '?'],
            backgroundImage: "images/fasttrack.jpg",
            sharedHtml: ""
        }
    };
    model.settings.cardNumbersString = model.settings.cardNumbers.join(', ');
    $scope.model = model;

    $scope.reset = function() {
        socket.emit("reset");
    };

    $scope.kick = function(user) {
        socket.emit("kick", user.uid);
    };

    $scope.showConnectCode = function() {
        model.showConnectCode = !model.showConnectCode;
    };

    var oldCardNumbers;
    $scope.showSettings = function () {
        oldCardNumbers = model.settings.cardNumbers;
        model.showSettings = true;
    };

    $scope.saveSettings = function () {
        var cardNumbers = model.settings.cardNumbersString.replace(/ /g, '').split(",");
        if (cardNumbers.length > 0 && model.settings.cardNumbers != cardNumbers) {
            model.settings.cardNumbers = cardNumbers;
        }
        $scope.updateServerSettings();
        $scope.writeSettings();
        model.showSettings = false;
    };

    $scope.updateServerSettings = function () {
        socket.emit('updateSettings', createSettingsObject());
    };

    function createSettingsObject() {
        return {
            'cardNumbers': model.settings.cardNumbers,
            'sharedHtml': model.settings.sharedHtml,
            'backgroundImage': model.settings.backgroundImage
        };
    }

    $scope.loadSettings = function () {
        model.settings = $cookieStore.get('host-settings') || model.settings;
    };
    $scope.loadSettings();

    $scope.writeSettings = function () {
        $cookieStore.put('host-settings', model.settings);
    };

    $scope.showStatsContainer = function () {
        var s = model.settings;
        return model.allIn &&
            (s.showVoteAverage || s.showVoteMaximum || s.showVoteMinimum || s.showVoteSeparation);
    };

    $scope.getCardContainerStyle = function() {
        return {'width': (model.users.length * 200) + 'px'};
    };
    
    $scope.getVoteSeparationStyle = function () {
        var style = {};
        if (model.settings.showVoteSeparationThresholdCompromised && model.separation > model.settings.voteSeparationThreshold) {
            style = { 'color': 'red' };
        }
        return style;
    };

    $scope.getBodyBackgroundStyle = function () {
        var style = {};
        if (model.settings.backgroundImage) {
            style = {
                'background-image': 'url(' + model.settings.backgroundImage + ')'
            };
        }
        return style;
    };

    socket.on('connect', function(){
        socket.emit('bindHost', {sid: model.sid, 'settings': createSettingsObject()});
    });

    socket.on('reset', function(mode) {
        model.showConnectCode = false;
    });

    socket.on('dump', function (data) {
        var tmpUsers = {};
        for (var i in model.users) {
            tmpUsers[model.users[i].uid] = model.users[i];
        }

        for (i in data.users) {
            var user = data.users[i];
            var existing = tmpUsers[user.uid];
            if (!existing) {
                //console.log("Adding User");
                //console.log(user);
                model.users.push(user);
            }
            else {
                //console.log("Updating User");
                //console.log(user);
                tmpUsers[user.uid].username = user.username;
                tmpUsers[user.uid].orgVote = user.orgVote;
                tmpUsers[user.uid].vote = user.vote;
                tmpUsers[user.uid].connected = user.connected;
                delete tmpUsers[user.uid];
            }
        }

        // delete missing users
        for (var uid in tmpUsers) {
            //console.log("Removing User");
            //console.log(tmpUsers[uid]);
            i = model.users.indexOf(tmpUsers[uid]);
            model.users.splice(i, 1);
        }

        model.users.sort(function(a, b) {
            return a.username > b.username;
        });

        model.allIn = !model.users.some(function(u) { return u.vote === null; });

        if (model.users.length === 0)
            model.showConnectCode = true;

        if (model.users.some(function(u) { return u.vote !== null; }))
            model.showConnectCode = false;

        if (model.allIn) {
            if (model.settings.showVoteAverage) {
                $scope.updateVoteAverage();
            }

            if (model.settings.showVoteSeparation) {
                $scope.updateVoteSeparation();
            }

            if (model.settings.showVoteMaximum) {
                $scope.updateVoteMaximum();
            }

            if (model.settings.showVoteMinimum) {
                $scope.updateVoteMinimum();
            }

            $scope.updateVotesCounted();
        }
    });

    $scope.updateVoteAverage = function () {
        if (getNumericUserVotes().Count() > 0) {
            model.average = getNumericUserVotes()
                .Average()
                .toFixed(parseInt(model.settings.voteAverageNumDecimals));
        } else {
            model.average = 0;
        }
    };

    $scope.updateVoteSeparation = function () {
        var sortedCardNumbers = Enumerable.From(model.settings.cardNumbers)
            .Select(function (n) { return parseFloat(n); })
            .Where(function (n) { return !isNaN(n); })
            .ToArray().sort(function (a, b) { return a - b; });
        var voteIndexes = getNumericUserVotes().Select(function (v) {
            return sortedCardNumbers.indexOf(v);
        });
        model.separation = voteIndexes.Count() > 0 ? (voteIndexes.Max() - voteIndexes.Min()) : 0;
    };

    $scope.updateVoteMinimum = function () {
        model.minimum = getNumericUserVotes().Count() > 0 ? getNumericUserVotes().Min() : 0;
    };

    $scope.updateVoteMaximum = function () {
        model.maximum = getNumericUserVotes().Count() > 0 ? getNumericUserVotes().Max() : 0;
    };

    $scope.updateVotesCounted = function () {
        model.votesCounted = getNumericUserVotes().Count();
    };

    function getNumericUserVotes() {
        return Enumerable.From(model.users)
            .Select(function (u) { return parseFloat(u.vote); })
            .Where(function (n) { return !isNaN(n) && n != 999; });
    }

}]);