/**
 * Created by nslargent on 5/20/14.
 */

angular.module('ScrumWithSige').controller('IndexCtrl', ['$scope', '$window', function ($scope, $window) {

    $scope.sessionid = '';

    $scope.host = function() {
        $window.location = "/host";
    };

    $scope.join = function() {
        $window.location = "/join?session=" + $scope.sessionid.toString().toLowerCase();
    };

}]);