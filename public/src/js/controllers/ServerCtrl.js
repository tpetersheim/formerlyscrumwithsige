/// <reference path="../../../../_references.js" />
/**
 * Created by Nick Largent on 5/19/14.
 */

angular.module('ScrumWithSige').controller('ServerCtrl', ['$scope', '$location', '$timeout', '$sce', 'socket', 'tools', function ($scope, $location, $timeout, $sce, socket, tools) {

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
            cardNumbers: ["0", "0.5", "1", "2", "3", "5", "8", "13", "20", '?', 'fa-coffee'],
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

    $scope.showSettings = function () {
        model.showSettings = true;
    };

    $scope.saveSettings = function () {
        parseCardNumbers();
        $scope.updateServerSettings();
        $scope.writeSettings();
        model.showSettings = false;
    };

    function parseCardNumbers() {
        var cardNumbers = model.settings.cardNumbersString.replace(/ /g, '').split(",");
        cardNumbers = Enumerable.from(cardNumbers).Distinct().toArray();

        model.settings.cardNumbers = cardNumbers;
        model.settings.cardNumbersString = cardNumbers.join(', ');
    }

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
        model.settings = JSON.parse(localStorage.getItem('hostSettings')) || model.settings;
    };
    $scope.loadSettings();

    $scope.writeSettings = function () {
        localStorage.setItem('hostSettings', JSON.stringify(model.settings));
    };

    $scope.showStatsContainer = function () {
        var s = model.settings;
        return model.allIn &&
            (s.showVoteAverage || s.showVoteMaximum || s.showVoteMinimum || s.showVoteSeparation);
    };

    $scope.getCardValue = function (value, bigIcon) {
        return tools.getCardValue(value, bigIcon);
    };

    var faCoffee = "fa-coffee";
    $scope.addCoffeeCup = function () {
        model.settings.cardNumbersString += ", " + faCoffee;
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
                'background-image': 'url(' + model.settings.backgroundImage + ')',
                'background-size': 'cover'
            };
        }
        return style;
    };

    socket.on('connect', function(){
        socket.emit('bindHost', { sid: model.sid, 'settings': createSettingsObject() }, function () {
            $scope.updateServerSettings();
        });
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
        var avg;
        if (getNumericUserVotes().count() > 0) {
            var roundResult = true;

            avg = getNumericUserVotes().average();

            // Special case to handle .5
            var numDecimals = parseInt(model.settings.voteAverageNumDecimals);
            if (getNumericUserVotes().contains(0.5)) {
                if (numDecimals === 0) {
                    if (avg >= 0.25 && avg < 0.75) {
                        roundResult = false;
                        avg = 0.5;
                    }
                }
            }

            if (roundResult) {
                avg = avg.toFixed(numDecimals); 
            }
        } else {
            avg = 0;
        }

        model.average = avg;
    };

    $scope.updateVoteSeparation = function () {
        var sortedCardNumbers = Enumerable.from(model.settings.cardNumbers)
            .select(function (n) { return parseFloat(n); })
            .where(function (n) { return !isNaN(n); })
            .toArray().sort(function (a, b) { return a - b; });
        var voteIndexes = getNumericUserVotes().select(function (v) {
            return sortedCardNumbers.indexOf(v);
        });
        model.separation = voteIndexes.count() > 0 ? (voteIndexes.max() - voteIndexes.min()) : 0;
    };

    $scope.updateVoteMinimum = function () {
        model.minimum = getNumericUserVotes().count() > 0 ? getNumericUserVotes().min() : 0;
    };

    $scope.updateVoteMaximum = function () {
        model.maximum = getNumericUserVotes().count() > 0 ? getNumericUserVotes().max() : 0;
    };

    $scope.updateVotesCounted = function () {
        model.votesCounted = getNumericUserVotes().count();
    };

    function getNumericUserVotes() {
        return Enumerable.from(model.users)
            .select(function (u) { return parseFloat(u.vote); })
            .where(function (n) { return !isNaN(n); });
    }

}]);